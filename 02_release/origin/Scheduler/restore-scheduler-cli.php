<?php
declare(strict_types=1);
/* 管理者が手動で実行する復元処理。新規DBを作成するだけで、本番への切替は行いません。 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/scheduler-backup.php';
if (count($argv) !== 3) {
    fwrite(STDERR, "Usage: php restore-scheduler-cli.php <backup.json> <new-database.sqlite>\n");
    exit(2);
}
try {
    kptc_backup_restore($argv[1], $argv[2]);
    fwrite(STDOUT, "復元DBを作成し、整合性を確認しました。本番DBは変更していません。\n");
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . PHP_EOL);
    exit(1);
}
