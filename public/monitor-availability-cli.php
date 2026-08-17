<?php
declare(strict_types=1);

/* 内部サーバー監視専用。JSON連携の再送待ち、連続失敗、最終成功時刻を終了コードで通知します。 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/runtime-config.php';
kptc_load_runtime_config('internal');

try {
    $configured = trim((string)(getenv('KPTC_INTERNAL_SCHEDULER_DB') ?: ''));
    $databasePath = $configured !== '' ? $configured : dirname(__DIR__, 2) . '/GW/group-watcher.sqlite';
    if (!is_file($databasePath)) throw new RuntimeException('内部スケジュールDBが見つかりません');
    $pdo = new PDO('sqlite:' . $databasePath);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $rows = $pdo->query("SELECT key,value FROM app_meta WHERE key LIKE 'public_availability_%'")->fetchAll(PDO::FETCH_KEY_PAIR);
    $pending = ($rows['public_availability_pending'] ?? '1') === '1';
    $failures = (int)($rows['public_availability_consecutive_failures'] ?? '0');
    $lastSuccessAt = $rows['public_availability_last_success_at'] ?? null;
    $staleSeconds = max(600, (int)(getenv('KPTC_PUBLIC_AVAILABILITY_STALE_SECONDS') ?: 1800));
    $lastSuccessTimestamp = is_string($lastSuccessAt) ? strtotime($lastSuccessAt) : false;
    $stale = $lastSuccessTimestamp === false || $lastSuccessTimestamp < time() - $staleSeconds;
    $healthy = !$pending && $failures === 0 && !$stale;
    $status = [
        'ok'=>$healthy,
        'pending'=>$pending,
        'stale'=>$stale,
        'consecutiveFailures'=>$failures,
        'lastAttemptAt'=>$rows['public_availability_last_attempt_at'] ?? null,
        'lastSuccessAt'=>$lastSuccessAt,
        'sourceVersion'=>(int)($rows['public_availability_source_version'] ?? '0'),
        'lastError'=>$rows['public_availability_last_error'] ?? '',
    ];
    fwrite($healthy ? STDOUT : STDERR, json_encode($status, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL);
    exit($healthy ? 0 : 1);
} catch (Throwable $error) {
    fwrite(STDERR, json_encode(['ok'=>false, 'error'=>$error->getMessage()], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL);
    exit(2);
}
