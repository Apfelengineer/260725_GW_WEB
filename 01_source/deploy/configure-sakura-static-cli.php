<?php
declare(strict_types=1);
/* さくら既存設定の秘密値を画面へ出さず保持し、JSON生成・配信先だけを移行します。 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$base = '/home/apfelrunner/GW';
$path = $base . '/config/internal-env.php';
require $path;
$obsolete = ['KPTC_PUBLIC_AVAILABILITY_MODE', 'KPTC_PUBLIC_AVAILABILITY_ENDPOINT', 'KPTC_PUBLIC_AVAILABILITY_SECRET', 'KPTC_PUBLIC_AVAILABILITY_TIMEOUT', 'KPTC_PUBLIC_AVAILABILITY_ALLOW_HTTP'];
$settings = [];
foreach (getenv() as $name => $value) {
    if (str_starts_with($name, 'KPTC_') && !in_array($name, $obsolete, true)) $settings[$name] = $value;
}
$settings['KPTC_PUBLIC_AVAILABILITY_JSON'] = $base . '/outbox/public-availability.json';
$settings['KPTC_AVAILABILITY_SOURCE_JSON'] = $settings['KPTC_PUBLIC_AVAILABILITY_JSON'];
$settings['KPTC_AVAILABILITY_LOCAL_JSON'] = '/home/apfelrunner/www/GW/Calendar/data/public-availability.json';
$settings['KPTC_AVAILABILITY_STATUS_JSON'] = $base . '/delivery/status.json';
ksort($settings);
$contents = "<?php\ndeclare(strict_types=1);\n";
foreach ($settings as $name => $value) $contents .= 'putenv(' . var_export($name . '=' . $value, true) . ");\n";
$temporary = tempnam(dirname($path), '.static-env-');
if ($temporary === false || file_put_contents($temporary, $contents) !== strlen($contents) || !chmod($temporary, 0600) || !rename($temporary, $path)) throw new RuntimeException('設定の更新に失敗しました');
echo "Static publication paths configured; existing login/DB settings preserved.\n";
