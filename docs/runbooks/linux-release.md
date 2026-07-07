# Linux Release

This runbook covers the direct-download Linux release flow for RouteVN Creator.
Linux direct releases are AppImage-only.

## Versioning

- Keep the app version in `src-tauri/tauri.conf.json` and
  `src-tauri/Cargo.toml` aligned.
- Do not change the app version only to represent a package rebuild.

## Build

Build the Linux x86_64 AppImage on the host:

```shell
bun run tauri:build:linux:appimage
```

Build the Linux x86_64 AppImage in the Ubuntu 22.04 Docker builder for a more
compatible release baseline:

```shell
bun run tauri:build:linux:appimage:docker
```

The Docker-built AppImage, updater signature, and checksum are copied to:

- `dist/appimage/ubuntu-22.04/x86_64/`

## Updater

The Tauri updater supports Linux through the AppImage artifact only. Do not
publish `.deb` or `.rpm` updater entries.
