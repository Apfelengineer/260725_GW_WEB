<?php
declare(strict_types=1);

/* 内部サーバーの定期実行専用。最新の3か月JSONを送信し、成功・失敗を監視用メタ情報へ記録します。 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/runtime-config.php';
kptc_load_runtime_config('internal');
require_once __DIR__ . '/availability-publisher.php';

function kptc_cli_meta(PDO $pdo, string $key, string $value): void {
    $pdo->prepare('INSERT OR REPLACE INTO app_meta(key,value) VALUES(?,?)')->execute([$key, $value]);
}

function kptc_cli_meta_value(PDO $pdo, string $key): ?string {
    $statement = $pdo->prepare('SELECT value FROM app_meta WHERE key=?');
    $statement->execute([$key]);
    $value = $statement->fetchColumn();
    return $value === false ? null : (string)$value;
}

try {
    $configured = trim((string)(getenv('KPTC_INTERNAL_SCHEDULER_DB') ?: ''));
    $databasePath = $configured !== '' ? $configured : dirname(__DIR__, 2) . '/GW/group-watcher.sqlite';
    if (!is_file($databasePath)) throw new RuntimeException('内部スケジュールDBが見つかりません');
    $pdo = new PDO('sqlite:' . $databasePath);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    $row = $pdo->query('SELECT payload,version FROM app_state WHERE id=1')->fetch(PDO::FETCH_ASSOC);
    if (!$row) throw new RuntimeException('内部スケジュールを取得できません');
    $state = json_decode((string)$row['payload'], true, 64, JSON_THROW_ON_ERROR);
    if (!is_array($state)) throw new RuntimeException('内部スケジュールの形式が不正です');
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . PHP_EOL);
    exit(2);
}

$attemptAt = date(DATE_ATOM);
kptc_cli_meta($pdo, 'public_availability_last_attempt_at', $attemptAt);
kptc_cli_meta($pdo, 'public_availability_source_version', (string)$row['version']);
try {
    $published = kptc_publish_availability($state, (int)$row['version']);
    kptc_cli_meta($pdo, 'public_availability_pending', '0');
    kptc_cli_meta($pdo, 'public_availability_updated_at', (string)$published['updatedAt']);
    kptc_cli_meta($pdo, 'public_availability_last_success_at', date(DATE_ATOM));
    kptc_cli_meta($pdo, 'public_availability_last_error', '');
    kptc_cli_meta($pdo, 'public_availability_consecutive_failures', '0');
    fwrite(STDOUT, json_encode(['ok'=>true, 'updatedAt'=>$published['updatedAt'], 'sourceVersion'=>$published['sourceVersion']], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL);
    exit(0);
} catch (Throwable $error) {
    $failures = (int)(kptc_cli_meta_value($pdo, 'public_availability_consecutive_failures') ?? '0') + 1;
    kptc_cli_meta($pdo, 'public_availability_pending', '1');
    kptc_cli_meta($pdo, 'public_availability_consecutive_failures', (string)$failures);
    kptc_cli_meta($pdo, 'public_availability_last_error', substr($error->getMessage(), 0, 500));
    fwrite(STDERR, json_encode(['ok'=>false, 'pending'=>true, 'consecutiveFailures'=>$failures, 'error'=>$error->getMessage()], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL);
    exit(1);
}
