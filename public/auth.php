<?php
declare(strict_types=1);

/* 内部サーバー専用。認証情報を予定データから分離してSQLiteへ保存します。 */

function kptc_auth_create_tables(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS auth_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL COLLATE NOCASE UNIQUE,
        member_id TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')),
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_login_at TEXT
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS auth_users_member_id_idx ON auth_users(member_id)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS auth_login_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        attempt_key TEXT NOT NULL,
        attempted_at INTEGER NOT NULL
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS auth_login_attempts_key_time_idx ON auth_login_attempts(attempt_key, attempted_at)');
}

function kptc_auth_normalize_username(string $username): string {
    return strtolower(trim($username));
}

function kptc_auth_validate_username(string $username): void {
    if (!preg_match('/^[a-z0-9][a-z0-9._@-]{2,63}$/', $username)) throw new InvalidArgumentException('ユーザー名は3〜64文字の半角英数字・._@-で指定してください');
}

function kptc_auth_validate_password(string $password): void {
    if (strlen($password) < 12 || strlen($password) > 256) throw new InvalidArgumentException('パスワードは12〜256文字で指定してください');
}

function kptc_auth_password_hash(string $password): string {
    kptc_auth_validate_password($password);
    $algorithm = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
    $hash = password_hash($password, $algorithm);
    if (!is_string($hash)) throw new RuntimeException('パスワードを安全に保存できません');
    return $hash;
}

function kptc_auth_attempt_key(string $username, string $ipAddress): string {
    return hash('sha256', kptc_auth_normalize_username($username) . "\n" . $ipAddress);
}

function kptc_auth_is_rate_limited(PDO $pdo, string $attemptKey): bool {
    $cutoff = time() - 15 * 60;
    $pdo->prepare('DELETE FROM auth_login_attempts WHERE attempted_at < ?')->execute([$cutoff]);
    $statement = $pdo->prepare('SELECT COUNT(*) FROM auth_login_attempts WHERE attempt_key=? AND attempted_at>=?');
    $statement->execute([$attemptKey, $cutoff]);
    return (int)$statement->fetchColumn() >= 5;
}

function kptc_auth_record_failure(PDO $pdo, string $attemptKey): void {
    $pdo->prepare('INSERT INTO auth_login_attempts(attempt_key,attempted_at) VALUES(?,?)')->execute([$attemptKey, time()]);
}

function kptc_auth_clear_failures(PDO $pdo, string $attemptKey): void {
    $pdo->prepare('DELETE FROM auth_login_attempts WHERE attempt_key=?')->execute([$attemptKey]);
}

function kptc_auth_find_user(PDO $pdo, string $username): ?array {
    $statement = $pdo->prepare('SELECT id,username,member_id,password_hash,role,enabled FROM auth_users WHERE username=?');
    $statement->execute([kptc_auth_normalize_username($username)]);
    $row = $statement->fetch(PDO::FETCH_ASSOC);
    return is_array($row) ? $row : null;
}

function kptc_auth_verify(PDO $pdo, string $username, string $password, string $ipAddress): ?array {
    $normalized = kptc_auth_normalize_username($username);
    $attemptKey = kptc_auth_attempt_key($normalized, $ipAddress);
    if (kptc_auth_is_rate_limited($pdo, $attemptKey)) throw new OverflowException('ログイン試行回数が上限に達しました。15分後にお試しください');
    $user = kptc_auth_find_user($pdo, $normalized);
    $hash = is_array($user) ? (string)$user['password_hash'] : kptc_auth_password_hash(bin2hex(random_bytes(16)));
    $valid = password_verify($password, $hash) && is_array($user) && (int)$user['enabled'] === 1;
    if (!$valid) {
        kptc_auth_record_failure($pdo, $attemptKey);
        return null;
    }
    kptc_auth_clear_failures($pdo, $attemptKey);
    if (password_needs_rehash($hash, defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT)) {
        $pdo->prepare('UPDATE auth_users SET password_hash=?,updated_at=? WHERE id=?')->execute([kptc_auth_password_hash($password), date(DATE_ATOM), $user['id']]);
    }
    $pdo->prepare('UPDATE auth_users SET last_login_at=?,updated_at=? WHERE id=?')->execute([date(DATE_ATOM), date(DATE_ATOM), $user['id']]);
    return $user;
}

function kptc_auth_user_count(PDO $pdo): int {
    return (int)$pdo->query('SELECT COUNT(*) FROM auth_users')->fetchColumn();
}

function kptc_auth_active_session_user(PDO $pdo): ?array {
    $authUserId = (int)($_SESSION['auth_user_id'] ?? 0);
    $authenticatedAt = (int)($_SESSION['authenticated_at'] ?? 0);
    $lastActivityAt = (int)($_SESSION['last_activity_at'] ?? 0);
    $now = time();
    $idleTimeout = max(300, (int)(getenv('KPTC_AUTH_IDLE_TIMEOUT') ?: 1800));
    $absoluteTimeout = max($idleTimeout, (int)(getenv('KPTC_AUTH_ABSOLUTE_TIMEOUT') ?: 43200));
    if ($authUserId < 1 || $authenticatedAt < $now - $absoluteTimeout || $lastActivityAt < $now - $idleTimeout) return null;
    $statement = $pdo->prepare('SELECT id,username,member_id,role,enabled FROM auth_users WHERE id=?');
    $statement->execute([$authUserId]);
    $user = $statement->fetch(PDO::FETCH_ASSOC);
    if (!is_array($user) || (int)$user['enabled'] !== 1) return null;
    $_SESSION['last_activity_at'] = $now;
    return $user;
}

// 認証補助ファイルへ直接アクセスされた場合は内容を返しません。
if (isset($_SERVER['SCRIPT_FILENAME']) && realpath((string)$_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(404);
    exit;
}
