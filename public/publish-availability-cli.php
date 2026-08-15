<?php
declare(strict_types=1);

/* 月替わりに公開JSONを更新する、内部サーバーの定期実行専用スクリプトです。 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/availability-json.php';

$configured = trim((string)(getenv('KPTC_INTERNAL_SCHEDULER_DB') ?: ''));
$databasePath = $configured !== '' ? $configured : dirname(__DIR__, 2) . '/GW/group-watcher.sqlite';
$pdo = new PDO('sqlite:' . $databasePath);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$row = $pdo->query('SELECT payload,version FROM app_state WHERE id=1')->fetch(PDO::FETCH_ASSOC);
if (!$row) throw new RuntimeException('内部スケジュールを取得できません');

$state = json_decode((string)$row['payload'], true);
if (!is_array($state)) throw new RuntimeException('内部スケジュールの形式が不正です');
$published = kptc_publish_availability($state, (int)$row['version']);
fwrite(STDOUT, (string)$published['updatedAt'] . PHP_EOL);
