FROM archlinux:latest

ENV BUN_INSTALL_CACHE_DIR=/cache/bun
ENV CARGO_HOME=/cache/cargo-home
ENV PATH=/usr/local/bin:/usr/bin:/bin

RUN pacman -Syu --noconfirm --needed \
    archlinux-keyring \
    base-devel \
    bun \
    git \
    gst-libav \
    gst-plugins-bad \
    gst-plugins-good \
    gst-plugins-ugly \
    gtk3 \
    hicolor-icon-theme \
    libayatana-appindicator \
    librsvg \
    openssl \
    pkgconf \
    rust \
    sqlite \
    webkit2gtk-4.1 \
    xdg-utils \
  && pacman -Scc --noconfirm \
  && useradd --create-home --shell /bin/bash builder

RUN pacman -Syu --noconfirm --needed node-gyp \
  && pacman -Scc --noconfirm

COPY docker/aur/build-in-container.sh /usr/local/bin/build-routevn-aur-package
RUN chmod +x /usr/local/bin/build-routevn-aur-package

ENTRYPOINT ["/usr/local/bin/build-routevn-aur-package"]
