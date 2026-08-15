<?php
declare(strict_types=1);

/* 外部公開ページ専用API。内部の利用者・予定・操作履歴にはアクセスしません。 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=60');
require_once __DIR__ . '/availability-store.php';

try {
    $payload = kptc_read_public_availability();
    if ($payload === null) {
        http_response_code(503);
        echo json_encode(['error'=>'空き状況を準備しています'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    http_response_code(503);
    echo json_encode(['error'=>'空き状況を取得できません'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
