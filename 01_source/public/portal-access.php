<?php
declare(strict_types=1);

/* renkon（社内ポータル）から渡された暗号化トークンを検証し、内部画面の入口を保護します。 */

const KPTC_PORTAL_TOKEN_METHOD = 'AES-128-ECB';

function kptc_portal_today(): string {
    return (new DateTimeImmutable('now', new DateTimeZone('Asia/Tokyo')))->format('Ymd');
}

function kptc_portal_token_key(): string {
    // 指定された試験用キーを既定値とし、本番では内部設定ファイルの環境変数で差し替えられます。
    $key = (string)(getenv('KPTC_PORTAL_TOKEN_KEY') ?: 'test');
    return $key !== '' ? $key : 'test';
}

function kptc_portal_start_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $scriptDirectory = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/'))), '/');
    $cookiePath = trim((string)(getenv('KPTC_SESSION_COOKIE_PATH') ?: '')) ?: ($scriptDirectory === '' || $scriptDirectory === '.' ? '/' : $scriptDirectory . '/');
    $cookieSecureSetting = getenv('KPTC_SESSION_COOKIE_SECURE');
    $cookieSecure = $cookieSecureSetting === false ? !empty($_SERVER['HTTPS']) : $cookieSecureSetting === '1';
    session_name('KPTC_SCHEDULER_SESSION');
    session_set_cookie_params([
        'lifetime'=>0,
        'path'=>$cookiePath,
        'secure'=>$cookieSecure,
        'httponly'=>true,
        'samesite'=>'Strict',
    ]);
    session_start();
}

function kptc_portal_decrypt_token(string $encrypted): ?array {
    if ($encrypted === '' || strlen($encrypted) > 512 || !function_exists('openssl_decrypt')) return null;
    $userInformation = openssl_decrypt($encrypted, KPTC_PORTAL_TOKEN_METHOD, kptc_portal_token_key());
    if (!is_string($userInformation) || !preg_match('/^(\d{8})_user_(\d{3})$/D', $userInformation, $matches)) return null;
    if (!hash_equals(kptc_portal_today(), $matches[1])) return null;
    return ['date'=>$matches[1], 'userId'=>$matches[2]];
}

function kptc_portal_authorize_token(string $encrypted): bool {
    $identity = kptc_portal_decrypt_token($encrypted);
    if ($identity === null) return false;

    $sameIdentity = !empty($_SESSION['portal_access_granted'])
        && hash_equals((string)($_SESSION['portal_user_id'] ?? ''), $identity['userId'])
        && hash_equals((string)($_SESSION['portal_token_date'] ?? ''), $identity['date']);
    if (!$sameIdentity) {
        // 別の利用者として入り直す場合は、前の一般・管理者モードを引き継ぎません。
        session_regenerate_id(true);
        $_SESSION = [];
    }
    $_SESSION['portal_access_granted'] = true;
    $_SESSION['portal_user_id'] = $identity['userId'];
    $_SESSION['portal_token_date'] = $identity['date'];
    $_SESSION['portal_authorized_at'] = time();
    return true;
}

function kptc_portal_session_is_authorized(): bool {
    return !empty($_SESSION['portal_access_granted'])
        && preg_match('/^\d{3}$/D', (string)($_SESSION['portal_user_id'] ?? '')) === 1
        && hash_equals(kptc_portal_today(), (string)($_SESSION['portal_token_date'] ?? ''));
}

function kptc_portal_forbidden(bool $json = false): never {
    http_response_code(403);
    header('Cache-Control: no-store');
    if ($json) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error'=>'Forbidden'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    } else {
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Forbidden';
    }
    exit;
}

// 認証補助ファイルへ直接アクセスされた場合は内容を返しません。
if (isset($_SERVER['SCRIPT_FILENAME']) && realpath((string)$_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(404);
    exit;
}
