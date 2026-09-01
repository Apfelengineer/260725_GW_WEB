<?php
declare(strict_types=1);

/* 内部サーバー専用。ユーザーと権限を予定データから分離してSQLiteへ保存します。 */

function kptc_auth_create_tables(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS auth_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL COLLATE NOCASE UNIQUE,
        member_id TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user','room')),
        enabled INTEGER NOT NULL DEFAULT 1,
        auth_revision INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_login_at TEXT
    )");
    $tableSql = (string)$pdo->query("SELECT sql FROM sqlite_master WHERE type='table' AND name='auth_users'")->fetchColumn();
    if (!str_contains($tableSql, "'room'")) {
        // 既存アカウントを保持したまま、試験室権限を許可する制約へ移行します。
        $pdo->exec('ALTER TABLE auth_users RENAME TO auth_users_legacy_role');
        $pdo->exec("CREATE TABLE auth_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL COLLATE NOCASE UNIQUE,
            member_id TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user','room')),
            enabled INTEGER NOT NULL DEFAULT 1,
            auth_revision INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_login_at TEXT
        )");
        $legacyColumns = $pdo->query('PRAGMA table_info(auth_users_legacy_role)')->fetchAll(PDO::FETCH_COLUMN, 1);
        $revisionExpression = in_array('auth_revision', $legacyColumns, true) ? 'auth_revision' : '1';
        $pdo->exec("INSERT INTO auth_users(id,username,member_id,password_hash,role,enabled,auth_revision,created_at,updated_at,last_login_at) SELECT id,username,member_id,password_hash,role,enabled,{$revisionExpression},created_at,updated_at,last_login_at FROM auth_users_legacy_role");
        $pdo->exec('DROP TABLE auth_users_legacy_role');
    }
    $columns = $pdo->query('PRAGMA table_info(auth_users)')->fetchAll(PDO::FETCH_COLUMN, 1);
    if (!in_array('auth_revision', $columns, true)) $pdo->exec('ALTER TABLE auth_users ADD COLUMN auth_revision INTEGER NOT NULL DEFAULT 1');
    $pdo->exec('CREATE INDEX IF NOT EXISTS auth_users_member_id_idx ON auth_users(member_id)');
}

function kptc_auth_normalize_username(string $username): string {
    return strtolower(trim($username));
}

function kptc_auth_validate_username(string $username): void {
    if (!preg_match('/^[a-z0-9][a-z0-9._@-]{2,63}$/', $username)) throw new InvalidArgumentException('ユーザー名は3〜64文字の半角英数字・._@-で指定してください');
}

function kptc_auth_placeholder_hash(): string {
    // 旧DBとの互換性のため必須列を維持し、ログインには使用しないランダム値を保存します。
    $algorithm = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
    $hash = password_hash(bin2hex(random_bytes(32)), $algorithm);
    if (!is_string($hash)) throw new RuntimeException('アカウントを初期化できません');
    return $hash;
}

function kptc_auth_find_user(PDO $pdo, string $username): ?array {
    $statement = $pdo->prepare('SELECT id,username,member_id,password_hash,role,enabled,auth_revision FROM auth_users WHERE username=?');
    $statement->execute([kptc_auth_normalize_username($username)]);
    $row = $statement->fetch(PDO::FETCH_ASSOC);
    return is_array($row) ? $row : null;
}

function kptc_auth_select_user(PDO $pdo, string $username): ?array {
    // 社内システム側で認証済みであることを前提に、画面へ表示する有効ユーザーだけを受け付けます。
    $user = kptc_auth_find_user($pdo, $username);
    if (!is_array($user) || (int)$user['enabled'] !== 1 || !in_array((string)$user['role'], ['admin', 'user'], true)) return null;
    $pdo->prepare('UPDATE auth_users SET last_login_at=?,updated_at=? WHERE id=?')->execute([date(DATE_ATOM), date(DATE_ATOM), $user['id']]);
    return $user;
}

function kptc_auth_user_count(PDO $pdo): int {
    return (int)$pdo->query('SELECT COUNT(*) FROM auth_users')->fetchColumn();
}

function kptc_auth_account_list(PDO $pdo): array {
    // DB互換用の未使用ハッシュを含めず、管理画面に必要な項目だけを返します。
    $rows = $pdo->query('SELECT id,username,member_id,role,enabled,created_at,updated_at,last_login_at FROM auth_users ORDER BY username')->fetchAll(PDO::FETCH_ASSOC);
    return array_map(static fn(array $row): array => [
        'id'=>(int)$row['id'],
        'username'=>(string)$row['username'],
        'memberId'=>(string)$row['member_id'],
        'role'=>(string)$row['role'],
        'enabled'=>(int)$row['enabled'] === 1,
        'createdAt'=>(string)$row['created_at'],
        'updatedAt'=>(string)$row['updated_at'],
        'lastLoginAt'=>$row['last_login_at'] === null ? null : (string)$row['last_login_at'],
    ], $rows);
}

function kptc_auth_login_user_list(PDO $pdo, array $state): array {
    // ログイン画面には管理者・一般ユーザーだけを氏名付きで返し、試験室アカウントは表示しません。
    $memberNames = [];
    foreach ($state['members'] ?? [] as $member) $memberNames[(string)$member['id']] = (string)$member['name'];
    $rows = $pdo->query("SELECT username,member_id,role FROM auth_users WHERE enabled=1 AND role IN ('admin','user') ORDER BY username")->fetchAll(PDO::FETCH_ASSOC);
    return array_values(array_map(static fn(array $row): array => [
        'username'=>(string)$row['username'],
        'memberId'=>(string)$row['member_id'],
        'name'=>$memberNames[(string)$row['member_id']] ?? '削除済みユーザー',
        'role'=>(string)$row['role'],
    ], array_filter($rows, static fn(array $row): bool => isset($memberNames[(string)$row['member_id']]))));
}

function kptc_auth_enabled_admin_count(PDO $pdo): int {
    return (int)$pdo->query("SELECT COUNT(*) FROM auth_users WHERE role='admin' AND enabled=1")->fetchColumn();
}

function kptc_auth_active_session_user(PDO $pdo): ?array {
    $authUserId = (int)($_SESSION['auth_user_id'] ?? 0);
    $authenticatedAt = (int)($_SESSION['authenticated_at'] ?? 0);
    $lastActivityAt = (int)($_SESSION['last_activity_at'] ?? 0);
    $now = time();
    $idleTimeout = max(300, (int)(getenv('KPTC_AUTH_IDLE_TIMEOUT') ?: 1800));
    $absoluteTimeout = max($idleTimeout, (int)(getenv('KPTC_AUTH_ABSOLUTE_TIMEOUT') ?: 43200));
    if ($authenticatedAt < $now - $absoluteTimeout || $lastActivityAt < $now - $idleTimeout) return null;
    if (!empty($_SESSION['guest'])) {
        $_SESSION['last_activity_at'] = $now;
        return ['id'=>0, 'username'=>'guest', 'member_id'=>'guest', 'role'=>'guest', 'enabled'=>1, 'auth_revision'=>1];
    }
    if ($authUserId < 1) return null;
    $statement = $pdo->prepare('SELECT id,username,member_id,role,enabled,auth_revision FROM auth_users WHERE id=?');
    $statement->execute([$authUserId]);
    $user = $statement->fetch(PDO::FETCH_ASSOC);
    if (!is_array($user) || (int)$user['enabled'] !== 1) return null;
    $revision = (int)$user['auth_revision'];
    if (isset($_SESSION['auth_revision']) && (int)$_SESSION['auth_revision'] !== $revision) return null;
    $_SESSION['auth_revision'] = $revision;
    $_SESSION['last_activity_at'] = $now;
    return $user;
}

// 認証補助ファイルへ直接アクセスされた場合は内容を返しません。
if (isset($_SERVER['SCRIPT_FILENAME']) && realpath((string)$_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(404);
    exit;
}
