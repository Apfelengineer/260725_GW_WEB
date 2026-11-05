FROM python:3.13-slim-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssh-client \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /var/lib/kptc-public /var/lib/kptc-publish-status \
    && chown -R 1000:1000 /var/lib/kptc-public /var/lib/kptc-publish-status
COPY 01_source/publisher/delivery.py /opt/kptc/delivery.py
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
USER 1000:1000
HEALTHCHECK --interval=60s --timeout=5s --start-period=90s --retries=3 \
    CMD python /opt/kptc/delivery.py --health || exit 1
ENTRYPOINT ["python", "/opt/kptc/delivery.py"]
