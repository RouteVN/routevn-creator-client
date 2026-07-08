# Tauri Research For `routevn-packager`

Research date: April 13, 2026

Scope: how `routevn-packager` should use Tauri to turn a RouteVN web export zip into native builds and installers.

## Verified Current Tauri Versions

As of April 13, 2026, Tauri's official release page lists:

- `tauri` (Rust): `2.10.3`
- `tauri-cli` (Rust): `2.10.1`
- `@tauri-apps/cli` (JavaScript): `2.10.1`
- `@tauri-apps/api`: `2.10.1`
- `tauri-bundler`: `2.8.1`

This repo should target Tauri 2.x, not Tauri 1.x.

## Short Conclusion

Tauri is a good fit for this repo.

For desktop, the mapping is straightforward:

1. Extract the RouteVN zip.
2. Point Tauri's `build.frontendDist` at the extracted web files.
3. Generate app metadata and icons.
4. Run `tauri build`.

For mobile, Tauri also supports the workflow, but the packaging story is more operationally constrained:

- Android is supported by `tauri android build`.
- iOS is supported by `tauri ios build`.
- iOS builds are macOS-only.

The best first implementation is a Rust CLI that stages a minimal reusable Tauri shell project and invokes the Tauri CLI with generated config overrides.

## Why Tauri Matches The RouteVN Export

The RouteVN export is already a built web payload:

- `index.html`
- `main.js`
- `package.bin`

Tauri's build flow uses the `build.frontendDist` directory as the built frontend input for:

- `tauri build`
- `tauri android build`
- `tauri ios build`

That means `routevn-packager` does not need a frontend build step if the zip already contains the final runtime files. In practice, this means:

- unzip to a temp directory
- validate required files exist
- set `build.frontendDist` to that directory
- leave `beforeBuildCommand` empty

If `main.js` loads `package.bin` using normal relative web paths, this should preserve the existing web behavior with minimal compatibility risk.

Inference:
If `package.bin` later becomes large enough that binary size or bundling performance becomes a problem, Tauri's `bundle.resources` feature is a possible fallback. That would likely require RouteVN runtime changes, so it is not the best first implementation path.

## Recommended Implementation Model

### Recommended v1

Implement `routevn-packager` as a Rust CLI that orchestrates a Tauri template project.

High-level flow:

1. Accept an input zip and output directory.
2. Extract the zip to a temporary staging directory.
3. Validate `index.html`, `main.js`, and `package.bin`.
4. Materialize a minimal Tauri shell project.
5. Generate config overrides for app metadata, title, identifiers, version, targets, and icons.
6. Run the appropriate Tauri build command.
7. Collect the resulting artifacts into `--out`.

### Why This Is Better Than Building Everything From Scratch

- Tauri already handles native bundling for desktop and mobile.
- Tauri already has platform-specific config merging.
- Tauri already generates icons.
- Tauri already knows how to emit installers and store-ready package formats.

So `routevn-packager` should act as a packaging orchestrator around Tauri, not as a replacement for Tauri.

## Two CLI Integration Options

### Option A: Shell Out To Tauri CLI

Recommended for v1.

Implementation shape:

- keep a minimal Tauri shell project in this repo
- generate a config patch file
- run:
  - `cargo tauri build`
  - `cargo tauri android build`
  - `cargo tauri ios build`

Why this is the better starting point:

- closest to Tauri's documented workflow
- easiest to debug against official docs
- least coupling to Tauri CLI internals
- easier to reproduce manually outside this repo

### Option B: Embed `tauri_cli` As A Rust Dependency

Possible, but not the best first choice.

The official Rust docs for `tauri_cli` show that it exposes `run` and `try_run`, and that the crate runs on macOS, Windows, and Linux.

Why I would not start here:

- the public docs are relatively thin
- this couples `routevn-packager` more tightly to Tauri CLI internals
- the operational benefit over shelling out is limited for a first version

Recommendation:
Start with shelling out to `cargo tauri ...`. Revisit embedded `tauri_cli` only if process spawning becomes a real problem.

## Tauri Config Pieces That Matter Most

At minimum, `routevn-packager` will need to generate or override:

- `productName`
- `identifier`
- `version`
- `build.frontendDist`
- `app.windows[].title`
- `bundle.icon`
- `bundle.active`

Tauri also supports platform-specific config files that merge into the base config:

- `tauri.windows.conf.json`
- `tauri.linux.conf.json`
- `tauri.macos.conf.json`
- `tauri.android.conf.json`
- `tauri.ios.conf.json`

The Tauri CLI also supports `--config` with JSON strings or config files that merge with the default config, in order.

This is important for `routevn-packager`, because it means the CLI can keep one base Tauri shell and generate per-build overrides instead of rewriting the full project every time.

Example generated override:

```json
{
  "productName": "My RouteVN Game",
  "identifier": "com.routevn.mygame",
  "version": "1.0.0",
  "build": {
    "frontendDist": "/absolute/path/to/staging/web"
  },
  "app": {
    "windows": [
      {
        "title": "My RouteVN Game"
      }
    ]
  },
  "bundle": {
    "active": true,
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

## Icons And Platform Assets

Tauri already has a built-in `icon` command that generates platform icon sets from a source PNG or SVG.

Useful implementation pattern:

1. Accept a master icon input from the user.
2. Run `tauri icon`.
3. Point `bundle.icon` at the generated files for desktop.
4. Let Tauri write mobile icons into the generated Android and Xcode projects.

Important detail:

- desktop icons normally live in `src-tauri/icons`
- mobile icons are placed directly into the Android Studio and Xcode projects

This is a strong fit for your stated need to handle icons and other app-facing metadata.

## Desktop Build Commands

For desktop, the main command is:

```bash
cargo tauri build
```

Tauri's documented flow is:

- `tauri build` builds the app in release mode
- it uses `build.frontendDist`
- it generates bundles and installers

The separate `tauri bundle` command is also available if you want to split binary build and installer generation.

That split can be useful later for store-specific or per-platform release profiles.

## Mobile Build Commands

For Android:

```bash
cargo tauri android build
```

This generates:

- APKs
- AABs

For iOS:

```bash
cargo tauri ios build
```

This generates:

- IPAs

Important hard constraint:

- all iOS commands are only available on macOS hosts

## Host And Target Reality

Your CLI can run on Windows and Linux.

That does not mean one host can build every target.

### Practical matrix

- Windows host:
  - Windows desktop: yes
  - Android: yes
  - Linux desktop: not the normal first path
  - macOS desktop: no realistic local path
  - iOS: no

- Linux host:
  - Linux desktop: yes
  - Android: yes
  - Windows desktop: partial, mostly NSIS cross-compilation territory
  - macOS desktop: no
  - iOS: no

- macOS host:
  - macOS desktop: yes
  - iOS: yes
  - Android: yes
  - Windows desktop: not the normal first path

Specific official constraints I confirmed:

- Windows `.msi` installers can only be created on Windows
- macOS app bundles and DMGs must be built on a Mac computer
- iOS development and build are macOS-only
- Linux packages should be built on an old enough Linux base system to avoid glibc compatibility problems

Implementation consequence:
`routevn-packager` should expose targets clearly, validate host compatibility early, and probably rely on CI runners for full multi-platform release automation.

## Metadata And Store-Oriented Fields

At minimum, this repo should plan for:

- display title
- product name
- bundle/package identifier
- semantic version
- build number
- icons

Later, per-platform packaging will also need:

- macOS signing and notarization inputs
- Windows installer settings and signing inputs
- Android version code and signing inputs
- iOS signing, provisioning, and App Store metadata inputs

Tauri supports store and installer flows, but code signing is required on most platforms, so this should be modeled as explicit config, not hidden magic.

## What This Means For `routevn-packager`

### Best first scope

Start with desktop packaging first:

- Windows
- Linux
- macOS

And treat mobile as phase 2.

Reason:

- desktop is the cleanest fit for a zip-to-wrapper pipeline
- mobile adds SDK, provisioning, and signing complexity quickly
- this lets the repo prove the Tauri-shell architecture before adding Android and iOS workflows

### Recommended repo structure

One solid approach:

```text
routevn-packager/
├── src/
│   ├── main.rs
│   ├── cli.rs
│   ├── zip.rs
│   ├── config.rs
│   ├── tauri.rs
│   └── targets.rs
├── tauri-shell/
│   ├── src-tauri/
│   ├── src/
│   └── package metadata
└── TAURI_RESEARCH.md
```

The CLI should generate ephemeral config and staging directories instead of mutating the committed shell project directly.

### Recommended command surface

Simple first shape:

```bash
routevn-packager build ./my-game.zip --out ./dist
```

Likely next flags:

- `--target windows`
- `--target linux`
- `--target macos`
- `--target android`
- `--target ios`
- `--config routevn-packager.json`
- `--icon ./icon.png`
- `--identifier com.routevn.mygame`
- `--title "My Game"`
- `--version 1.0.0`
- `--release`

## Important Open Questions

These should be settled before implementation:

1. How does RouteVN currently load `package.bin` in the browser?
2. Will app metadata come from a config file, CLI flags, or both?
3. Do we want one Tauri shell for all targets, or separate shell templates for desktop and mobile?
4. Is unsigned local packaging enough for v1, or do we need signing hooks immediately?
5. Should Android and iOS be local-only workflows, CI-only workflows, or both?

## Recommended Next Step

Implement a proof of concept for desktop only:

1. build a minimal Tauri shell project
2. extract the RouteVN zip into a temp directory
3. point `build.frontendDist` at the extracted files
4. inject `productName`, `identifier`, `version`, and icon config
5. run `cargo tauri build`
6. verify the packaged app can load `index.html`, `main.js`, and `package.bin` unchanged

If that works, the architecture is validated and the repo can expand to Android, iOS, and store-specific profiles afterward.

## Sources

All sources below are official Tauri docs or official Rust API docs:

- Tauri core ecosystem releases: <https://v2.tauri.app/release/>
- Tauri configuration reference: <https://v2.tauri.app/reference/config/>
- Tauri CLI reference: <https://v2.tauri.app/reference/cli/>
- Tauri distribute guide: <https://v2.tauri.app/distribute/>
- Tauri app icons guide: <https://v2.tauri.app/develop/icons/>
- Tauri additional resources guide: <https://v2.tauri.app/develop/resources/>
- Tauri prerequisites: <https://v2.tauri.app/start/prerequisites/>
- Tauri macOS application bundle guide: <https://v2.tauri.app/distribute/macos-application-bundle/>
- Tauri Windows installer guide: <https://v2.tauri.app/distribute/windows-installer/>
- Tauri Debian guide: <https://v2.tauri.app/distribute/debian/>
- `tauri_cli` Rust crate docs: <https://docs.rs/tauri-cli/latest/tauri_cli/>
