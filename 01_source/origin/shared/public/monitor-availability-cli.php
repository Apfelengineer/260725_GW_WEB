<?php
declare(strict_types=1);
/* JSONの生成完了と配信完了を区別し、配信プロセスの状態を終了コードで監視します。 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/runtime-config.php';
kptc_load_runtime_config('internal');
require_once __DIR__ . '/availability-publisher.php';
try {
    $path = trim((string)(getenv('KPTC_INTERNAL_SCHEDULER_DB') ?: '')) ?: dirname(__DIR__, 2) . '/GW/group-watcher.sqlite';
    if (!is_file($path)) throw new RuntimeException('内部スケジュールDBが見つかりません');
    $pdo = new PDO('sqlite:' . $path);
    $version = (int)$pdo->query('SELECT version FROM app_state WHERE id=1')->fetchColumn();
    $pending = $pdo->query("SELECT value FROM app_meta WHERE key='public_availability_pending'")->fetchColumn() === '1';
    $status = kptc_availability_delivery_status($version, $pending);
    fwrite($status['ok'] ? STDOUT : STDERR, json_encode($status, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL);
    exit($status['ok'] ? 0 : 1);
} catch (Throwable $error) {
    fwrite(STDERR, json_encode(['ok'=>false, 'error'=>$error->getMessage()], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL);
    exit(2);
}
