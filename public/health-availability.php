<?php
declare(strict_types=1);

/* 外部監視専用。公開JSONの存在、形式、最終受信時刻、対象月を検査します。 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
require_once __DIR__ . '/availability-contract.php';

try {
    $payload = kptc_read_public_availability();
    if ($payload === null) throw new RuntimeException('公開JSONがありません');
    $payload = kptc_validate_public_availability($payload);
    $updatedTimestamp = strtotime((string)$payload['updatedAt']);
    $staleSeconds = max(600, (int)(getenv('KPTC_PUBLIC_AVAILABILITY_STALE_SECONDS') ?: 1800));
    $currentRangeStart = (new DateTimeImmutable('first day of this month', new DateTimeZone('Asia/Tokyo')))->format('Y-m-d');
    $healthy = $updatedTimestamp !== false && $updatedTimestamp >= time() - $staleSeconds && $payload['rangeStart'] === $currentRangeStart;
    http_response_code($healthy ? 200 : 503);
    echo json_encode(['ok'=>$healthy, 'updatedAt'=>$payload['updatedAt'], 'rangeStart'=>$payload['rangeStart'], 'sourceVersion'=>$payload['sourceVersion']], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    http_response_code(503);
    echo json_encode(['ok'=>false, 'error'=>'公開情報を確認できません'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
