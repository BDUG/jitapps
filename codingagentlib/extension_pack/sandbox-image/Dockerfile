# Build once with a trusted Debian 12 base; run only by the resulting image ID.
ARG BASE_IMAGE=debian:bookworm-slim
FROM ${BASE_IMAGE}
USER root
RUN apt-get update && apt-get install -y --no-install-recommends python3 chromium chromium-driver ca-certificates && rm -rf /var/lib/apt/lists/*
ENV HOME=/tmp
USER 65534:65534
WORKDIR /tmp
ENTRYPOINT ["python3"]
