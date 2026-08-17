<?php
declare(strict_types=1);

/* 内部サーバー専用。公開用JSONをローカル保存または署名付きHTTPSで外部サーバーへ送ります。 */
require_once __DIR__ . '/availability-json.php';

function kptc_publish_mode(): string {
    $mode = strtolower(trim((string)(getenv('KPTC_PUBLIC_AVAILABILITY_MODE') ?: 'local')));
    if (!in_array($mode, ['local', 'https'], true)) throw new RuntimeException('KPTC_PUBLIC_AVAILABILITY_MODE は local または https を指定してください');
    return $mode;
}

function kptc_publish_secret(): string {
    $secret = (string)(getenv('KPTC_PUBLIC_AVAILABILITY_SECRET') ?: '');
    if (strlen($secret) < 32) throw new RuntimeException('KPTC_PUBLIC_AVAILABILITY_SECRET は32文字以上で設定してください');
    return $secret;
}

function kptc_send_public_availability(array $payload): array {
    $endpoint = trim((string)(getenv('KPTC_PUBLIC_AVAILABILITY_ENDPOINT') ?: ''));
    if ($endpoint === '') throw new RuntimeException('外部サーバーの受信URLが設定されていません');
    $scheme = strtolower((string)parse_url($endpoint, PHP_URL_SCHEME));
    $allowHttp = getenv('KPTC_PUBLIC_AVAILABILITY_ALLOW_HTTP') === '1';
    if ($scheme !== 'https' && !($allowHttp && $scheme === 'http')) throw new RuntimeException('外部サーバーの受信URLにはHTTPSを使用してください');
    if (!function_exists('curl_init')) throw new RuntimeException('PHP cURL拡張が必要です');

    $body = json_encode(kptc_validate_public_availability($payload), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($body === false) throw new RuntimeException('公開JSONを生成できません');
    $timestamp = (string)time();
    $signature = hash_hmac('sha256', $timestamp . "\n" . $body, kptc_publish_secret());
    $timeout = max(3, min(60, (int)(getenv('KPTC_PUBLIC_AVAILABILITY_TIMEOUT') ?: 10)));

    $curl = curl_init($endpoint);
    if ($curl === false) throw new RuntimeException('外部送信を開始できません');
    curl_setopt_array($curl, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'X-KPTC-Timestamp: ' . $timestamp,
            'X-KPTC-Signature: sha256=' . $signature,
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => min(5, $timeout),
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_MAXREDIRS => 0,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_USERAGENT => 'KPTC-Scheduler-Availability-Publisher/1.0',
    ]);
    $responseBody = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $curlError = curl_error($curl);
    curl_close($curl);
    if ($responseBody === false || $curlError !== '') throw new RuntimeException('外部送信に失敗しました: ' . $curlError);
    if (!in_array($status, [200, 202], true)) throw new RuntimeException('外部サーバーが送信を拒否しました (HTTP ' . $status . ')');
    return $payload;
}

function kptc_publish_availability(array $state, int $sourceVersion): array {
    $payload = kptc_build_public_availability($state, $sourceVersion);
    return kptc_publish_mode() === 'https' ? kptc_send_public_availability($payload) : kptc_store_public_availability($payload);
}

// 補助ファイルをURLから直接実行できないようにします。
if (isset($_SERVER['SCRIPT_FILENAME']) && realpath((string)$_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(404);
    exit;
}
