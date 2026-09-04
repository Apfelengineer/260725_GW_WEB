<?php
declare(strict_types=1);

require_once __DIR__ . '/renkon-config.php';

/* user_3桁IDを毎回異なるIVでCBC暗号化し、IV＋暗号文をBase64化してoriginへ転送します。 */
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
$userId = isset($_GET['user_id']) && is_string($_GET['user_id']) ? trim($_GET['user_id']) : '';
if (preg_match('/^\d{3}$/D', $userId) !== 1 || !function_exists('openssl_encrypt')) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Forbidden';
    exit;
}

$method = 'AES-256-CBC';
$key = kptc_renkon_token_key();
$data = 'user_' . $userId;
try {
    $ivLength = openssl_cipher_iv_length($method);
    if ($ivLength !== 16) throw new RuntimeException('Invalid IV length');
    $randomIv = openssl_random_pseudo_bytes($ivLength, $strong);
    if (!$strong || strlen($randomIv) !== $ivLength) throw new RuntimeException('IV generation failed');
    $encryptedRaw = openssl_encrypt($data, $method, $key, OPENSSL_RAW_DATA, $randomIv);
    if (!is_string($encryptedRaw)) throw new RuntimeException('Encryption failed');
    $encrypted = base64_encode($randomIv . $encryptedRaw);
} catch (Throwable $error) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Token generation failed';
    exit;
}

$schedulerUrl = kptc_renkon_scheduler_url();
$separator = str_contains($schedulerUrl, '?') ? '&' : '?';
header('Location: ' . $schedulerUrl . $separator . 'token=' . rawurlencode($encrypted), true, 302);
exit;
