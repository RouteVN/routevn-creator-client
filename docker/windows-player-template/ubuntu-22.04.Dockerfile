FROM ubuntu:22.04

ARG BUN_VERSION=1.3.11
ARG NODE_MAJOR=22
ARG RUST_TOOLCHAIN=1.97.1
ARG WINDOWS_TARGET=x86_64-pc-windows-msvc
ARG CARGO_XWIN_VERSION=0.19.2

ENV DEBIAN_FRONTEND=noninteractive
ENV RUSTUP_HOME=/opt/rustup
ENV CARGO_HOME=/opt/cargo
ENV BUN_INSTALL=/opt/bun
ENV PATH=/opt/cargo/bin:/opt/bun/bin:/usr/local/bin:$PATH

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    clang \
    curl \
    git \
    build-essential \
    pkg-config \
    libssl-dev \
    llvm \
    lld \
    rsync \
    unzip \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - \
  && apt-get install -y --no-install-recommends nodejs python3 \
  && npm install -g node-gyp@11.5.0 \
  && rm -rf /var/lib/apt/lists/*

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
  | sh -s -- -y --profile minimal --default-toolchain "${RUST_TOOLCHAIN}" \
  && rustup target add "${WINDOWS_TARGET}" \
  && cargo install cargo-xwin --version "${CARGO_XWIN_VERSION}" --locked \
  && chmod -R a+rwx /opt/rustup /opt/cargo

RUN curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}" \
  && if ! command -v clang-cl >/dev/null 2>&1; then \
    command -v clang; \
    printf '%s\n' '#!/usr/bin/env sh' 'exec clang --driver-mode=cl "$@"' > /usr/local/bin/clang-cl; \
    chmod +x /usr/local/bin/clang-cl; \
  fi \
  && chmod -R a+rx /opt/bun \
  && bun --version \
  && node --version \
  && rustc --version \
  && cargo-xwin --version \
  && command -v llvm-rc \
  && clang-cl --version

COPY docker/windows-player-template/build-in-container.sh /usr/local/bin/build-routevn-windows-player-template
RUN chmod +x /usr/local/bin/build-routevn-windows-player-template

ENTRYPOINT ["/usr/local/bin/build-routevn-windows-player-template"]
