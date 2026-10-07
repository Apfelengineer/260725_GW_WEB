FROM php:8.4-apache-bookworm

ARG DEBIAN_FRONTEND=noninteractive

ENV TZ=Asia/Tokyo \
    KPTC_PUBLIC_AVAILABILITY_JSON=/var/lib/kptc-availability/public-availability.json \
    KPTC_PUBLIC_CONFIG_FILE=/run/kptc/public-env.php \
    KPTC_PUBLIC_AVAILABILITY_STALE_SECONDS=1800

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl tzdata \
    && ln -snf /usr/share/zoneinfo/${TZ} /etc/localtime \
    && echo "${TZ}" > /etc/timezone \
    && a2enmod headers \
    && rm -rf /var/lib/apt/lists/*

COPY 02_release/origin/Calendar/ /var/www/html/
COPY docker/origin/Calendar/apache-security.conf /etc/apache2/conf-available/kptc-security.conf
COPY docker/origin/Calendar/entrypoint.sh /usr/local/bin/kptc-calendar-entrypoint

RUN a2enconf kptc-security \
    && chmod 0755 /usr/local/bin/kptc-calendar-entrypoint \
    && chown -R root:root /var/www/html \
    && find /var/www/html -type d -exec chmod 0755 {} + \
    && find /var/www/html -type f -exec chmod 0644 {} + \
    && mkdir -p /var/lib/kptc-availability /run/kptc \
    && chown -R www-data:www-data /var/lib/kptc-availability

VOLUME ["/var/lib/kptc-availability"]
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD test "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1/receive-availability.php)" = "405" || exit 1

ENTRYPOINT ["/usr/local/bin/kptc-calendar-entrypoint"]
CMD ["apache2-foreground"]
