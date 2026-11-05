# 公開カレンダーにはPHP・受信API・秘密鍵を含めません。
FROM nginx:stable-alpine
COPY docker/origin/Calendar/nginx.conf /etc/nginx/nginx.conf
COPY 02_release/origin/Calendar/ /usr/share/nginx/html/
RUN test -z "$(find /usr/share/nginx/html -name '*.php' -print)" \
    && mkdir -p /var/lib/kptc-public \
    && chown 1000:1000 /var/lib/kptc-public
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
