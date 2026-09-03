<?php
declare(strict_types=1);

require_once __DIR__ . '/runtime-config.php';
kptc_load_runtime_config('internal');
require_once __DIR__ . '/portal-access.php';

/* スケジューラ画面の入口。renkonが発行した当日用トークンがない要求は403で終了します。 */
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
kptc_portal_start_session();
$token = isset($_GET['token']) && is_string($_GET['token']) ? $_GET['token'] : '';
if (!kptc_portal_authorize_token($token)) kptc_portal_forbidden();

// ビルド時、このPHPの直後へReact画面のHTMLが連結されます。
?>
