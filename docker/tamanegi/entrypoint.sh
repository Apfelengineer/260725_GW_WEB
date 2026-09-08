#!/bin/sh
set -eu

if [ -z "${KPTC_PUBLIC_AVAILABILITY_SECRET:-}" ]; then
    echo "ERROR: KPTC_PUBLIC_AVAILABILITY_SECRET must be set." >&2
    exit 1
fi
if [ "${#KPTC_PUBLIC_AVAILABILITY_SECRET}" -lt 32 ]; then
    echo "ERROR: KPTC_PUBLIC_AVAILABILITY_SECRET must contain at least 32 characters." >&2
    exit 1
fi

mkdir -p /var/lib/kptc-availability /run/kptc
chown -R www-data:www-data /var/lib/kptc-availability

# Web処理が参照する公開JSON保存先と共有鍵を、公開領域外の設定へ写します。
/usr/local/bin/php -r '
$keys = array_filter(array_keys(getenv()), static fn(string $key): bool => str_starts_with($key, "KPTC_"));
sort($keys);
$contents = "<?php\ndeclare(strict_types=1);\n";
foreach ($keys as $key) {
    $value = getenv($key);
    if (!is_string($value)) continue;
    $contents .= "putenv(" . var_export($key . "=" . $value, true) . ");\n";
}
if (file_put_contents("/run/kptc/public-env.php", $contents, LOCK_EX) === false) exit(1);
'
chown root:www-data /run/kptc/public-env.php
chmod 0640 /run/kptc/public-env.php

exec docker-php-entrypoint "$@"
