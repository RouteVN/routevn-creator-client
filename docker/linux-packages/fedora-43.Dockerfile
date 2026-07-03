FROM fedora:43

ARG BUN_VERSION=1.3.11
ARG RUST_TOOLCHAIN=stable

ENV RUSTUP_HOME=/opt/rustup
ENV CARGO_HOME=/opt/cargo
ENV BUN_INSTALL=/opt/bun
ENV PATH=/opt/cargo/bin:/opt/bun/bin:/usr/local/bin:$PATH

RUN dnf install -y \
    ca-certificates \
    curl \
    file \
    findutils \
    gcc \
    gcc-c++ \
    git \
    glib2 \
    glib2-devel \
    gtk3 \
    gtk3-devel \
    gdk-pixbuf2 \
    gdk-pixbuf2-devel \
    gstreamer1-libav \
    gstreamer1-plugins-base \
    gstreamer1-plugins-good \
    libayatana-appindicator-gtk3 \
    libayatana-appindicator-gtk3-devel \
    librsvg2 \
    librsvg2-devel \
    make \
    nodejs \
    openssl-devel \
    pkgconf-pkg-config \
    rsync \
    unzip \
    webkit2gtk4.1 \
    webkit2gtk4.1-devel \
    xdg-utils \
    xz \
  && dnf clean all

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
