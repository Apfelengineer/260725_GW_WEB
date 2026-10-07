#!/bin/sh
set -eu

[ -n "${KPTC_PORTAL_TOKEN_KEY:-}" ] || { echo "ERROR: KPTC_PORTAL_TOKEN_KEY must be set." >&2; exit 1; }
[ -n "${KPTC_PUBLIC_AVAILABILITY_ENDPOINT:-}" ] || { echo "ERROR: KPTC_PUBLIC_AVAILABILITY_ENDPOINT must be set." >&2; exit 1; }
[ -n "${KPTC_PUBLIC_AVAILABILITY_PAGE_URL:-}" ] || { echo "ERROR: KPTC_PUBLIC_AVAILABILITY_PAGE_URL must be set." >&2; exit 1; }
[ -n "${KPTC_PUBLIC_AVAILABILITY_SECRET:-}" ] || { echo "ERROR: KPTC_PUBLIC_AVAILABILITY_SECRET must be set." >&2; exit 1; }

if [ "${#KPTC_PUBLIC_AVAILABILITY_SECRET}" -lt 32 ]; then
    echo "ERROR: KPTC_PUBLIC_AVAILABILITY_SECRET must contain at least 32 characters." >&2
    exit 1
fi

case "$KPTC_PUBLIC_AVAILABILITY_ENDPOINT" in
    https://*) ;;
    http://*)
        if [ "${KPTC_PUBLIC_AVAILABILITY_ALLOW_HTTP:-0}" != "1" ]; then
            echo "ERROR: The availability endpoint must use HTTPS." >&2
            exit 1
        fi
        ;;
    *)
        echo "ERROR: KPTC_PUBLIC_AVAILABILITY_ENDPOINT is not a valid HTTP(S) URL." >&2
        exit 1
        ;;
esac

mkdir -p /var/lib/kptc-scheduler/backups /run/kptc
chown -R www-data:www-data /var/lib/kptc-scheduler

# Apacheとcronの双方が同じ実行時設定を読むため、コンテナ環境変数を非公開PHP設定へ写します。
/usr/local/bin/php -r '
$keys = array_filter(array_keys(getenv()), static fn(string $key): bool => str_starts_with($key, "KPTC_"));
sort($keys);
$contents = "<?php\ndeclare(strict_types=1);\n";
foreach ($keys as $key) {
    $value = getenv($key);
    if (!is_string($value)) continue;
    $contents .= "putenv(" . var_export($key . "=" . $value, true) . ");\n";
}
if (file_put_contents("/run/kptc/internal-env.php", $contents, LOCK_EX) === false) exit(1);
'
chown root:www-data /run/kptc/internal-env.php
chmod 0640 /run/kptc/internal-env.php

cron
exec docker-php-entrypoint "$@"
