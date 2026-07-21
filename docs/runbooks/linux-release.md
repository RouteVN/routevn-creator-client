# Linux Release

This runbook covers the direct-download Linux release flow for RouteVN Creator.
Linux direct releases are AppImage-only.

## Versioning

- For every app release, update the version in all four of these places:
  - `src-tauri/tauri.conf.json`: the top-level `version`
  - `src-tauri/Cargo.toml`: the `routevn-creator` package version
  - `src-tauri/Cargo.lock`: the `routevn-creator` package entry
  - `src-tauri/assets/com.routevn.creator.metainfo.xml`: the latest Linux
    `<release>` entry, including its release date
- Keep all four version values aligned.
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

- `src-tauri/target/release/bundle/appimage/linux-x86_64-<version>/`

The final artifact names are stable:

- `RouteVN-Creator.AppImage`
- `RouteVN-Creator.AppImage.sig`
- `RouteVN-Creator.AppImage.sha256`

When publishing, put the version, platform, and architecture in one release
folder name rather than the file name, for example:

- `routevn-creator-client/linux-x86_64-<version>/RouteVN-Creator.AppImage`
- `routevn-creator-client/linux-x86_64-<version>/RouteVN-Creator.AppImage.sig`
- `routevn-creator-client/linux-x86_64-<version>/RouteVN-Creator.AppImage.sha256`

This keeps the published AppImage name consistent with the per-user installed
file at `~/Applications/RouteVN-Creator.AppImage`.

## Updater

The Tauri updater supports Linux through the AppImage artifact only.

Do not add, build, or publish Linux package-manager artifacts for direct
RouteVN Creator releases. This includes AUR packages, `.deb` packages, and
`.rpm` packages. AppImage is the only supported direct Linux format because it
keeps the update path owned by the Tauri updater and avoids distro-specific
package maintenance.

## Desktop Integration

Direct AppImage builds prompt users to add RouteVN Creator to their application
launcher. The integration is per-user and does not require sudo: it copies the
current AppImage to `~/Applications/RouteVN-Creator.AppImage`, writes the
launcher entry to `~/.local/share/applications/`, and installs hicolor icons
under `~/.local/share/icons/`.

After integration, the app closes the current AppImage process and reopens from
`~/Applications/RouteVN-Creator.AppImage` so the Tauri updater replaces the
installed AppImage. AppImageLauncher or appimaged are not required for this
flow.
