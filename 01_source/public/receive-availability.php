<?php
declare(strict_types=1);

/* 外部サーバー専用。内部サーバーから届く署名付き3か月JSONだけを検証して保存します。 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
require_once __DIR__ . '/runtime-config.php';
kptc_load_runtime_config('public');
require_once __DIR__ . '/availability-contract.php';

function kptc_receiver_respond(array $payload, int $status): never {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') kptc_receiver_respond(['error'=>'POSTで送信してください'], 405);
$contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($contentLength < 1 || $contentLength > 131072) kptc_receiver_respond(['error'=>'JSONのサイズが不正です'], 413);
$secret = (string)(getenv('KPTC_PUBLIC_AVAILABILITY_SECRET') ?: '');
if (strlen($secret) < 32) kptc_receiver_respond(['error'=>'受信機能が設定されていません'], 503);
$timestampHeader = trim((string)($_SERVER['HTTP_X_KPTC_TIMESTAMP'] ?? ''));
$signatureHeader = trim((string)($_SERVER['HTTP_X_KPTC_SIGNATURE'] ?? ''));
if (!preg_match('/^\d{10}$/', $timestampHeader) || abs(time() - (int)$timestampHeader) > 300) kptc_receiver_respond(['error'=>'送信時刻を確認できません'], 401);
if (!preg_match('/^sha256=([a-f0-9]{64})$/', $signatureHeader, $matches)) kptc_receiver_respond(['error'=>'署名を確認できません'], 401);
$rawBody = file_get_contents('php://input');
if (!is_string($rawBody) || $rawBody === '') kptc_receiver_respond(['error'=>'JSONを受信できません'], 400);
$expected = hash_hmac('sha256', $timestampHeader . "\n" . $rawBody, $secret);
if (!hash_equals($expected, $matches[1])) kptc_receiver_respond(['error'=>'署名を確認できません'], 401);

try {
    $payload = json_decode($rawBody, true, 32, JSON_THROW_ON_ERROR);
    if (!is_array($payload)) throw new InvalidArgumentException('JSONの形式が不正です');
    $validated = kptc_validate_public_availability($payload);
    $existing = kptc_read_public_availability();
    if ($existing !== null) {
        try { $existing = kptc_validate_public_availability($existing); }
        catch (InvalidArgumentException $error) { $existing = null; }
    }
    if ($existing !== null && kptc_compare_public_availability($validated, $existing) < 0) kptc_receiver_respond(['error'=>'現在の公開情報より古いJSONです'], 409);
    $stored = kptc_store_public_availability($validated);
    $unchanged = $existing !== null && kptc_compare_public_availability($validated, $existing) === 0;
    kptc_receiver_respond(['ok'=>true, 'updated'=>!$unchanged, 'updatedAt'=>$stored['updatedAt']], $unchanged ? 202 : 200);
} catch (JsonException|InvalidArgumentException $error) {
    kptc_receiver_respond(['error'=>$error->getMessage()], 400);
} catch (UnexpectedValueException $error) {
    kptc_receiver_respond(['error'=>$error->getMessage()], 409);
} catch (Throwable $error) {
    error_log('Public availability receive failed: ' . $error->getMessage());
    kptc_receiver_respond(['error'=>'公開情報を保存できません'], 503);
}
