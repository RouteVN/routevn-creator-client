# Linux Release

This runbook covers the direct-download Linux package release flow for RouteVN
Creator.

## Versioning

- Keep the app version in `src-tauri/tauri.conf.json` and
  `src-tauri/Cargo.toml` aligned.
- Debian packages use the app version only. For example, app version `1.7.2`
  should build `routevn-creator_1.7.2_amd64.deb`.
- For RPM package rebuilds of the same app version, increment
  `bundle.linux.rpm.release` in `src-tauri/tauri.conf.json` before building.
  For example, the second RPM build for app version `1.7.2` should be
  `routevn-creator-1.7.2-2.x86_64.rpm`.
- Reset `bundle.linux.rpm.release` to `"1"` when the app version changes.
- For AUR package rebuilds of the same app version, increment `pkgrel` in
  `packaging/aur/PKGBUILD` and regenerate `packaging/aur/.SRCINFO`.
- Do not change the app version only to represent an RPM or AUR package
  release.

## Build

Build Linux x86_64 native packages in Docker:

```shell
bun run tauri:build:linux:deb:docker
bun run tauri:build:linux:rpm:docker
bun run tauri:build:linux:aur:docker
```

The Docker-built packages and checksums are copied to:

- `dist/linux-packages/ubuntu-22.04/x86_64/`
- `dist/linux-packages/fedora-43/x86_64/`
- `dist/aur/x86_64/`
