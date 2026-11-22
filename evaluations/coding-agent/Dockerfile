# Build once, then run by the resulting immutable image ID.
ARG BASE_IMAGE=node:22-bookworm-slim
FROM ${BASE_IMAGE}
RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates coreutils && rm -rf /var/lib/apt/lists/*
ENV PYTHONDONTWRITEBYTECODE=1 HOME=/tmp
USER 65534:65534
WORKDIR /tmp
ENTRYPOINT ["node"]
