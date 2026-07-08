# RouteVN Packager

`routevn-packager` packages a RouteVN web export into a native desktop app using Tauri.

Current scope:

- Linux
- macOS
- Windows

Current implementation status:

- desktop only
- Tauri 2 based shell
- host-local packaging by default

That means:

- Linux packages are produced from Linux hosts
- macOS packages are produced from macOS hosts
- Windows packages are produced from Windows hosts, or from the repository's
  Windows player-template Docker build flow

Mobile and store-specific packaging are not implemented yet.

## Input Format

`routevn-packager` expects a RouteVN export zip from `routevn-creator-client` containing:

- `index.html`
- `main.js`
- `package.bin`

The files can be either at the zip root or inside a single nested export directory. The CLI extracts the zip, locates the export root, validates the required files, then stages the app into a reusable Tauri shell.

## CLI

Build a desktop package:

```bash
routevn-packager build ./my-game.zip --out ./dist
```

Example with explicit metadata:

```bash
routevn-packager build ./my-game.zip \
  --out ./dist \
  --title "My Game" \
  --identifier vn.routevn.my-game \
  --version 1.0.0 \
  --icon ./app-icon.png
```

Supported flags:

- `--out <dir>`: output directory for generated artifacts
- `--config <file>`: JSON or TOML config file
- `--title <title>`: app display title
- `--identifier <id>`: reverse-DNS style app identifier
- `--version <semver>`: app version
- `--icon <file>`: source icon file for Tauri icon generation
- `--target <linux|macos|windows>`: target platform
- `--keep-temp`: keep the generated temporary Tauri workspace
- `--verbose`: print Tauri command output

Current target behavior:

- if `--target` is omitted, the CLI builds for the current host platform
- unsupported cross-host requests fail early

## Config File

Config files can be `.json` or `.toml`.

Supported fields:

- `title`
- `identifier`
- `version`
- `icon`
- `targets`

CLI flags override config file values.

Example:

```toml
title = "Sample Export"
identifier = "vn.routevn.sample-export"
version = "0.1.0"
icon = "../fixtures/sample-icon.png"
targets = ["linux"]
```

A committed example lives at
[examples/sample-config.toml](./examples/sample-config.toml).

## Defaults

If metadata is not supplied, the CLI derives defaults from the zip filename:

- `title`: humanized from the zip stem
- `identifier`: `vn.routevn.<slug>`
- `version`: `0.1.0`

Example:

- `my_cool-game.zip` becomes `My Cool Game`
- identifier becomes `vn.routevn.my-cool-game`

## Windows Player Template

The Creator app exports portable Windows players and NSIS installers from a
prebuilt Windows player template checked in under
`src-tauri/assets/player-templates/windows/`.

Build or refresh that template with:

```bash
bun run player-template:build:win:docker
```

The template is generated from [tauri-shell](./tauri-shell). Per-project
metadata, icon resources, and the embedded RouteVN package are stamped by the
Creator app during export.

## Linux Requirements

The CLI now performs a Linux preflight check before invoking Tauri.

At minimum, this host needs:

- `webkit2gtk-4.1`
- `javascriptcoregtk-4.1`

On Arch-based systems, the current error hint uses:

```bash
sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget file openssl appmenu-gtk-module libappindicator-gtk3 librsvg xdotool
```

If those dependencies are missing, the CLI stops early with a targeted error instead of failing deep inside Cargo.

## Development

Run tests:

```bash
cargo test
```

Run the CLI from the repo:

```bash
cargo run -- build ./path/to/export.zip --out ./dist
```

Sample fixtures included in the repo:

- [fixtures/sample-export/index.html](./fixtures/sample-export/index.html)
- [fixtures/sample-export/main.js](./fixtures/sample-export/main.js)
- [fixtures/sample-export/package.bin](./fixtures/sample-export/package.bin)
- [fixtures/sample-icon.png](./fixtures/sample-icon.png)

Create a sample zip from the fixture on systems with `bsdtar`:

```bash
bsdtar -a -cf /tmp/sample-export.zip -C fixtures/sample-export .
```

Then run:

```bash
cargo run -- build /tmp/sample-export.zip --out /tmp/routevn-out --icon fixtures/sample-icon.png
```

## Implementation Notes

The repo now contains:

- a Rust CLI in [src](./src)
- a reusable Tauri shell in [tauri-shell](./tauri-shell)
- test coverage for zip validation, metadata resolution, target handling, artifact collection, and generated Tauri config

The build flow is:

1. parse CLI arguments
2. load optional config
3. resolve metadata and targets
4. extract the RouteVN zip to a temp workspace
5. validate `index.html`, `main.js`, and `package.bin`
6. copy and rewrite the Tauri shell for the current build
7. generate icons and a merged Tauri config override
8. run `cargo tauri build`
9. copy generated artifacts into `--out`

## Current Limitations

- mobile packaging is not implemented
- Steam or store packaging is not implemented
- desktop builds are host-local only
- actual desktop bundling still depends on the native Tauri prerequisites being installed on the build machine
