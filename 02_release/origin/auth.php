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
    if ($authUserId < 1) return null;
    $statement = $pdo->prepare('SELECT id,username,member_id,role,enabled,auth_revision FROM auth_users WHERE id=?');
    $statement->execute([$authUserId]);
    $user = $statement->fetch(PDO::FETCH_ASSOC);
    if (!is_array($user) || (int)$user['enabled'] !== 1) return null;
    $revision = (int)$user['auth_revision'];
    if (isset($_SESSION['auth_revision']) && (int)$_SESSION['auth_revision'] !== $revision) return null;
    $_SESSION['auth_revision'] = $revision;
    $_SESSION['last_activity_at'] = $now;
    // アカウント固有の旧権限は互換用に保持し、画面上の権限はモードで決定します。
    $user['account_role'] = (string)$user['role'];
    $user['role'] = !empty($_SESSION['admin_mode']) ? 'admin' : 'user';
    return $user;
}

function kptc_auth_reset_session_preserving_portal(): void {
    // 操作モードを再初期化しても、renkonで確認済みのCBCアクセス情報は保持します。
    $_SESSION = [
        'portal_access_granted'=>!empty($_SESSION['portal_access_granted']),
        'portal_user_id'=>(string)($_SESSION['portal_user_id'] ?? ''),
        'portal_token_method'=>(string)($_SESSION['portal_token_method'] ?? ''),
        'portal_authorized_at'=>(int)($_SESSION['portal_authorized_at'] ?? 0),
    ];
}

function kptc_auth_start_general_session(PDO $pdo, array $state): array {
    // ログイン画面を使わず、予定表に存在する最初の有効な一般・管理者アカウントを操作記録の主体にします。
    $memberIds = [];
    $fallbackMemberId = '';
    foreach ($state['members'] ?? [] as $member) {
        $memberId = (string)($member['id'] ?? '');
        if ($memberId === '') continue;
        $memberIds[$memberId] = true;
        if ($fallbackMemberId === '' && (string)($member['group'] ?? '') !== '試験室') $fallbackMemberId = $memberId;
    }
    if ($fallbackMemberId === '') throw new RuntimeException('一般モードに対応するユーザーが見つかりません');

    $rows = $pdo->query("SELECT id,username,member_id,role,enabled,auth_revision FROM auth_users WHERE enabled=1 AND role IN ('user','admin') ORDER BY CASE role WHEN 'user' THEN 0 ELSE 1 END,id")->fetchAll(PDO::FETCH_ASSOC);
    $user = null;
    foreach ($rows as $row) {
        if (isset($memberIds[(string)$row['member_id']])) { $user = $row; break; }
    }
    if (!is_array($user)) {
        // 新規環境でもすぐ一般モードを利用できるよう、内部処理専用アカウントを一度だけ作成します。
        $now = date(DATE_ATOM);
        $existing = kptc_auth_find_user($pdo, 'system-general');
        if (is_array($existing)) {
            $pdo->prepare("UPDATE auth_users SET member_id=?,role='user',enabled=1,auth_revision=auth_revision+1,updated_at=? WHERE id=?")->execute([$fallbackMemberId,$now,(int)$existing['id']]);
        } else {
            $pdo->prepare("INSERT INTO auth_users(username,member_id,password_hash,role,enabled,auth_revision,created_at,updated_at) VALUES('system-general',?,?,'user',1,1,?,?)")->execute([$fallbackMemberId,kptc_auth_placeholder_hash(),$now,$now]);
        }
        $user = kptc_auth_find_user($pdo, 'system-general');
    }
    if (!is_array($user)) throw new RuntimeException('一般モードを開始できません');

    // renkonで確認済みの入口情報を残したまま、一般モードの操作セッションを開始します。
    $portalSession = $_SESSION;
    session_regenerate_id(true);
    $_SESSION = $portalSession + [
        'auth_user_id'=>(int)$user['id'],
        'auth_revision'=>(int)$user['auth_revision'],
        'authenticated_at'=>time(),
        'last_activity_at'=>time(),
        'admin_mode'=>false,
        'csrf'=>bin2hex(random_bytes(24)),
    ];
    $user['account_role'] = (string)$user['role'];
    $user['role'] = 'user';
    return $user;
}

function kptc_auth_admin_password_hash(PDO $pdo): ?string {
    $statement = $pdo->prepare("SELECT value FROM app_meta WHERE key='admin_mode_password_hash'");
    $statement->execute();
    $value = $statement->fetchColumn();
    return is_string($value) && $value !== '' ? $value : null;
}

function kptc_auth_admin_password_configured(PDO $pdo): bool {
    return kptc_auth_admin_password_hash($pdo) !== null;
}

function kptc_auth_validate_admin_password(string $password): void {
    $length = function_exists('mb_strlen') ? mb_strlen($password) : strlen($password);
    if ($length < 8 || $length > 128) throw new InvalidArgumentException('管理者パスワードは8〜128文字で設定してください');
}

function kptc_auth_set_admin_password(PDO $pdo, string $password): void {
    kptc_auth_validate_admin_password($password);
    $algorithm = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
    $hash = password_hash($password, $algorithm);
    if (!is_string($hash)) throw new RuntimeException('管理者パスワードを保存できません');
    $pdo->prepare("INSERT OR REPLACE INTO app_meta(key,value) VALUES('admin_mode_password_hash',?)")->execute([$hash]);
}

function kptc_auth_verify_admin_password(PDO $pdo, string $password): bool {
    $hash = kptc_auth_admin_password_hash($pdo);
    return $hash !== null && password_verify($password, $hash);
}

// 認証補助ファイルへ直接アクセスされた場合は内容を返しません。
if (isset($_SERVER['SCRIPT_FILENAME']) && realpath((string)$_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(404);
    exit;
}
