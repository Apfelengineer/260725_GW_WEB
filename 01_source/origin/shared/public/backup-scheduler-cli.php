<?php
declare(strict_types=1);
/* 毎日22時の定期実行用。失敗時は直前の正常JSONを変更せず、非0で終了します。 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/runtime-config.php';
kptc_load_runtime_config('internal');
require_once __DIR__ . '/scheduler-backup.php';
try {
    $database = trim((string)(getenv('KPTC_INTERNAL_SCHEDULER_DB') ?: '')) ?: dirname(__DIR__, 2) . '/GW/group-watcher.sqlite';
    $destination = trim((string)(getenv('KPTC_SCHEDULER_BACKUP_JSON') ?: '')) ?: dirname($database) . '/backups/scheduler-latest.json';
    $result = kptc_backup_run($database, $destination);
    fwrite(STDOUT, kptc_backup_json($result) . PHP_EOL);
} catch (Throwable $error) {
    fwrite(STDERR, kptc_backup_json(['ok'=>false,'at'=>date(DATE_ATOM),'error'=>$error->getMessage()]) . PHP_EOL);
    exit(1);
}
