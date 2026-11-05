<?php
declare(strict_types=1);

/* Schedulerは公開JSONの生成だけを担当します。転送用秘密鍵は別プロセスが保有します。 */
require_once __DIR__ . '/availability-json.php';

function kptc_publish_availability(array $state, int $sourceVersion): array {
    return kptc_store_public_availability(kptc_build_public_availability($state, $sourceVersion));
}

function kptc_availability_delivery_status(int $sourceVersion, bool $exportPending = false): array {
    $path = trim((string)(getenv('KPTC_AVAILABILITY_STATUS_JSON') ?: '')) ?: dirname(__DIR__, 2) . '/GW/availability-delivery-status.json';
    $status = [];
    if (is_file($path) && filesize($path) <= 65536) {
        $contents = file_get_contents($path);
        $decoded = is_string($contents) ? json_decode($contents, true) : null;
        if (is_array($decoded)) $status = $decoded;
    }
    $lastSuccessAt = is_string($status['lastSuccessAt'] ?? null) ? $status['lastSuccessAt'] : null;
    $lastSuccessTime = $lastSuccessAt === null ? false : strtotime($lastSuccessAt);
    $staleSeconds = max(600, (int)(getenv('KPTC_PUBLIC_AVAILABILITY_STALE_SECONDS') ?: 1800));
    $stale = $lastSuccessTime === false || $lastSuccessTime < time() - $staleSeconds;
    $pending = $exportPending || ($status['ok'] ?? false) !== true || (int)($status['sourceVersion'] ?? 0) !== $sourceVersion || $stale;
    return [
        'ok'=>!$pending,
        'pending'=>$pending,
        'stale'=>$stale,
        'lastAttemptAt'=>is_string($status['lastAttemptAt'] ?? null) ? $status['lastAttemptAt'] : null,
        'lastSuccessAt'=>$lastSuccessAt,
        'consecutiveFailures'=>(int)($status['consecutiveFailures'] ?? 0),
        'sourceVersion'=>(int)($status['sourceVersion'] ?? 0),
        'lastError'=>is_string($status['lastError'] ?? null) ? $status['lastError'] : '',
    ];
}

if (isset($_SERVER['SCRIPT_FILENAME']) && realpath((string)$_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(404);
    exit;
}
