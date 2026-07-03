FROM ubuntu:22.04

ARG BUN_VERSION=1.3.11
ARG NODE_MAJOR=22
ARG RUST_TOOLCHAIN=stable

ENV DEBIAN_FRONTEND=noninteractive
ENV RUSTUP_HOME=/opt/rustup
ENV CARGO_HOME=/opt/cargo
ENV BUN_INSTALL=/opt/bun
ENV PATH=/opt/cargo/bin:/opt/bun/bin:/usr/local/bin:$PATH

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    wget \
    gnupg \
    file \
    build-essential \
    pkg-config \
    git \
    rsync \
    xz-utils \
    unzip \
    libssl-dev \
    libwebkit2gtk-4.1-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    xdg-utils \
    libgtk-3-bin \
    libglib2.0-bin \
    libgdk-pixbuf2.0-bin \
    webp-pixbuf-loader \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    gstreamer1.0-libav \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
  | sh -s -- -y --profile minimal --default-toolchain "${RUST_TOOLCHAIN}" \
  && chmod -R a+rwx /opt/rustup /opt/cargo

RUN curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}" \
  && chmod -R a+rx /opt/bun \
  && bun --version \
  && node --version \
  && rustc --version

COPY docker/linux-packages/build-in-container.sh /usr/local/bin/build-routevn-linux-package
RUN chmod +x /usr/local/bin/build-routevn-linux-package

ENTRYPOINT ["/usr/local/bin/build-routevn-linux-package"]
