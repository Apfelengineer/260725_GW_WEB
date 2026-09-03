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
<!doctype html>
<!-- さくらインターネットで配信するKPTC Schedulerメイン画面のHTML入口です。 -->
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0c2138" />
    <meta name="description" content="チームと試験室の予定を共有できる KPTC Scheduler のWEBブラウザ版です。" />
    <meta property="og:title" content="KPTC Scheduler" />
    <meta property="og:description" content="チームと試験室の予定を、ひと目で共有。" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="./og.png" />
    <title>KPTC Scheduler｜チームと試験室の予定をひと目で</title>
    <script type="module" crossorigin src="./assets/main-Bp_zSfpi.js"></script>
    <link rel="stylesheet" crossorigin href="./assets/main-DPEKaoOp.css">
  </head>
  <body>
    <!-- Reactがこの要素内へ画面全体を描画します。 -->
    <div id="root"></div>
  </body>
</html>
