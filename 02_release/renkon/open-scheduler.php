<?php
declare(strict_types=1);

require_once __DIR__ . '/renkon-config.php';

/* 入力された3桁IDを当日の日付と組み合わせ、指定方式で暗号化してoriginへ転送します。 */
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
$userId = isset($_GET['user_id']) && is_string($_GET['user_id']) ? trim($_GET['user_id']) : '';
if (preg_match('/^\d{3}$/D', $userId) !== 1 || !function_exists('openssl_encrypt')) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Forbidden';
    exit;
}

$method = 'AES-128-ECB';
$key = kptc_renkon_token_key();
$use_id = (new DateTimeImmutable('now', new DateTimeZone('Asia/Tokyo')))->format('Ymd') . '_user_' . $userId;
$encrypted = openssl_encrypt($use_id, $method, $key);
if (!is_string($encrypted) || $encrypted === '') {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Token generation failed';
    exit;
}

$schedulerUrl = kptc_renkon_scheduler_url();
$separator = str_contains($schedulerUrl, '?') ? '&' : '?';
header('Location: ' . $schedulerUrl . $separator . 'token=' . rawurlencode($encrypted), true, 302);
exit;
