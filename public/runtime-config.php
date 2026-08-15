<?php
declare(strict_types=1);

/*
 * Web公開領域の外に置いた環境別設定を読み込みます。
 * 環境変数が使えない共有サーバーでも、秘密鍵を配布ファイルから分離できます。
 */
function kptc_load_runtime_config(string $role): void {
    static $loaded = [];
    if (isset($loaded[$role])) return;
    if (!in_array($role, ['internal', 'public'], true)) throw new InvalidArgumentException('設定種別が不正です');

    $environmentKey = $role === 'internal' ? 'KPTC_INTERNAL_CONFIG_FILE' : 'KPTC_PUBLIC_CONFIG_FILE';
    $configuredPath = trim((string)(getenv($environmentKey) ?: ''));
    $defaultPath = dirname(__DIR__, 2) . '/GW/config/' . $role . '-env.php';
    $configPath = $configuredPath !== '' ? $configuredPath : $defaultPath;
    if (is_file($configPath)) require $configPath;
    $loaded[$role] = true;
}

if (isset($_SERVER['SCRIPT_FILENAME']) && realpath((string)$_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(404);
    exit;
}
