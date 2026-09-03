<?php
declare(strict_types=1);

/* renkonからスケジューラへ渡すトークンの発行先と試験用共通鍵を管理します。 */

function kptc_renkon_scheduler_url(): string {
    $configured = trim((string)(getenv('KPTC_RENKON_SCHEDULER_URL') ?: ''));
    $url = $configured !== '' ? $configured : 'https://apfelrunner.sakura.ne.jp/GW/schedule/';
    $scheme = strtolower((string)(parse_url($url, PHP_URL_SCHEME) ?: ''));
    if (filter_var($url, FILTER_VALIDATE_URL) === false || !in_array($scheme, ['https', 'http'], true)) {
        throw new RuntimeException('スケジューラURLの設定が不正です');
    }
    return $url;
}

function kptc_renkon_token_key(): string {
    $key = (string)(getenv('KPTC_PORTAL_TOKEN_KEY') ?: 'test');
    return $key !== '' ? $key : 'test';
}

if (isset($_SERVER['SCRIPT_FILENAME']) && realpath((string)$_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(404);
    exit;
}
