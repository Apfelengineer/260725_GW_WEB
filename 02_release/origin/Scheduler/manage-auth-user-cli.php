<?php
declare(strict_types=1);

/* 内部サーバー管理者専用。ログインアカウントをWeb画面とは別経路で管理します。 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/runtime-config.php';
kptc_load_runtime_config('internal');
require_once __DIR__ . '/auth.php';

$databasePath = trim((string)(getenv('KPTC_INTERNAL_SCHEDULER_DB') ?: '')) ?: dirname(__DIR__, 2) . '/GW/group-watcher.sqlite';
$pdo = new PDO('sqlite:' . $databasePath);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->exec('CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
kptc_auth_create_tables($pdo);

function kptc_auth_cli_usage(): never {
    fwrite(STDERR, "Usage:\n  php manage-auth-user-cli.php list\n  php manage-auth-user-cli.php create <username> <member-id> [admin|user|room]\n  php manage-auth-user-cli.php enable|disable <username>\n  php manage-auth-user-cli.php set-admin-mode-password\n");
    exit(2);
}

try {
    $command = $argv[1] ?? '';
    if ($command === 'list') {
        $rows = $pdo->query('SELECT username,member_id,role,enabled,created_at,last_login_at FROM auth_users ORDER BY username')->fetchAll(PDO::FETCH_ASSOC);
        fwrite(STDOUT, json_encode($rows, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . PHP_EOL);
        exit(0);
    }
    if ($command === 'create') {
        $username = kptc_auth_normalize_username((string)($argv[2] ?? ''));
        $memberId = trim((string)($argv[3] ?? ''));
        $role = (string)($argv[4] ?? 'user');
        kptc_auth_validate_username($username);
        if ($memberId === '' || !in_array($role, ['admin', 'user', 'room'], true)) kptc_auth_cli_usage();
        $stateRow = $pdo->query('SELECT payload FROM app_state WHERE id=1')->fetch(PDO::FETCH_ASSOC);
        $state = is_array($stateRow) ? json_decode((string)$stateRow['payload'], true) : null;
        $memberIds = is_array($state) ? array_column($state['members'] ?? [], 'id') : [];
        if (!in_array($memberId, $memberIds, true)) throw new InvalidArgumentException('対応するスケジューラーユーザーが見つかりません');
        $now = date(DATE_ATOM);
        $statement = $pdo->prepare('INSERT INTO auth_users(username,member_id,password_hash,role,enabled,created_at,updated_at) VALUES(?,?,?,?,1,?,?)');
        $statement->execute([$username, $memberId, kptc_auth_placeholder_hash(), $role, $now, $now]);
        fwrite(STDOUT, "Created: {$username}\n");
        exit(0);
    }
    if (in_array($command, ['enable', 'disable'], true)) {
        $username = kptc_auth_normalize_username((string)($argv[2] ?? ''));
        kptc_auth_validate_username($username);
        $statement = $pdo->prepare('UPDATE auth_users SET enabled=?,auth_revision=auth_revision+1,updated_at=? WHERE username=?');
        $statement->execute([$command === 'enable' ? 1 : 0, date(DATE_ATOM), $username]);
        if ($statement->rowCount() !== 1) throw new RuntimeException('ユーザーが見つかりません');
        fwrite(STDOUT, ucfirst($command) . "d: {$username}\n");
        exit(0);
    }
    if ($command === 'set-admin-mode-password') {
        fwrite(STDOUT, "New admin mode password (8-128 characters): ");
        $hideInput = DIRECTORY_SEPARATOR === '/' && function_exists('shell_exec') && trim((string)shell_exec('command -v stty 2>/dev/null')) !== '';
        if ($hideInput) shell_exec('stty -echo');
        try {
            $password = rtrim((string)fgets(STDIN), "\r\n");
        } finally {
            if ($hideInput) {
                shell_exec('stty echo');
                fwrite(STDOUT, PHP_EOL);
            }
        }
        kptc_auth_set_admin_password($pdo, $password);
        fwrite(STDOUT, "Admin mode password updated.\n");
        exit(0);
    }
    kptc_auth_cli_usage();
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . PHP_EOL);
    exit(1);
}
