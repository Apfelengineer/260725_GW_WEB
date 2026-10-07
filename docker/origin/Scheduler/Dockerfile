FROM php:8.4-apache-bookworm

ARG DEBIAN_FRONTEND=noninteractive

ENV TZ=Asia/Tokyo \
    KPTC_INTERNAL_SCHEDULER_DB=/var/lib/kptc-scheduler/group-watcher.sqlite \
    KPTC_SCHEDULER_BACKUP_JSON=/var/lib/kptc-scheduler/backups/scheduler-latest.json \
    KPTC_INTERNAL_CONFIG_FILE=/run/kptc/internal-env.php \
    KPTC_SESSION_COOKIE_SECURE=1 \
    KPTC_AUTH_IDLE_TIMEOUT=1800 \
    KPTC_AUTH_ABSOLUTE_TIMEOUT=43200 \
    KPTC_PUBLIC_AVAILABILITY_MODE=https \
    KPTC_PUBLIC_AVAILABILITY_TIMEOUT=10 \
    KPTC_PUBLIC_AVAILABILITY_STALE_SECONDS=1800

RUN apt-get update \
    && apt-get install -y --no-install-recommends cron curl libcurl4-openssl-dev libonig-dev libsqlite3-dev tzdata \
    && docker-php-ext-install -j"$(nproc)" curl mbstring pdo_sqlite sqlite3 \
    && ln -snf /usr/share/zoneinfo/${TZ} /etc/localtime \
    && echo "${TZ}" > /etc/timezone \
    && a2enmod headers \
    && rm -rf /var/lib/apt/lists/*

COPY 02_release/origin/Scheduler/ /var/www/html/
COPY docker/origin/Scheduler/apache-security.conf /etc/apache2/conf-available/kptc-security.conf
COPY docker/origin/Scheduler/kptc-cron /etc/cron.d/kptc-scheduler
COPY docker/origin/Scheduler/entrypoint.sh /usr/local/bin/kptc-scheduler-entrypoint

RUN a2enconf kptc-security \
    && chmod 0644 /etc/cron.d/kptc-scheduler \
    && chmod 0755 /usr/local/bin/kptc-scheduler-entrypoint \
    && chown -R root:root /var/www/html \
    && find /var/www/html -type d -exec chmod 0755 {} + \
    && find /var/www/html -type f -exec chmod 0644 {} + \
    && mkdir -p /var/lib/kptc-scheduler/backups /run/kptc \
    && chown -R www-data:www-data /var/lib/kptc-scheduler

VOLUME ["/var/lib/kptc-scheduler"]
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD test "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1/)" = "403" || exit 1

ENTRYPOINT ["/usr/local/bin/kptc-scheduler-entrypoint"]
CMD ["apache2-foreground"]
