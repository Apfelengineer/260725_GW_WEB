#!/bin/sh
set -eu
[ -n "${KPTC_PORTAL_TOKEN_KEY:-}" ] || { echo "ERROR: KPTC_PORTAL_TOKEN_KEY must be set." >&2; exit 1; }
[ -n "${KPTC_PUBLIC_AVAILABILITY_PAGE_URL:-}" ] || { echo "ERROR: KPTC_PUBLIC_AVAILABILITY_PAGE_URL must be set." >&2; exit 1; }
mkdir -p /var/lib/kptc-scheduler/backups /var/lib/kptc-outbox /run/kptc
chown -R www-data:www-data /var/lib/kptc-scheduler /var/lib/kptc-outbox
chmod 0755 /var/lib/kptc-outbox
# Webとcronが同じ内部設定を使います。SFTP鍵はこのコンテナへ渡しません。
/usr/local/bin/php -r '
$keys = array_filter(array_keys(getenv()), static fn(string $key): bool => str_starts_with($key, "KPTC_"));
sort($keys);
$contents = "<?php\ndeclare(strict_types=1);\n";
foreach ($keys as $key) {
    $value = getenv($key);
    if (is_string($value)) $contents .= "putenv(" . var_export($key . "=" . $value, true) . ");\n";
}
if (file_put_contents("/run/kptc/internal-env.php", $contents, LOCK_EX) === false) exit(1);
'
chown root:www-data /run/kptc/internal-env.php
chmod 0640 /run/kptc/internal-env.php
cron
exec docker-php-entrypoint "$@"
