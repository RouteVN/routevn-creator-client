# macOS Player Export Plan

Status: planned; not implemented.

Date baseline: July 15, 2026.

## Goal

Add a local macOS player export to the Versions flow that follows the existing
Windows prebuilt-template model. Exporting a game must not compile a new Tauri
application on the creator's machine.

The export must work from RouteVN Creator running on either an Intel Mac or an
Apple silicon Mac and produce one universal application that runs natively on
both architectures.

## Product Contract

The initial macOS export has the following contract:

- supported export hosts:
  - macOS on `x86_64`
  - macOS on `aarch64`
- unsupported export hosts:
  - Windows
  - Linux
- output: `<game-name>-mac.zip`
- ZIP contents: one universal `<game-name>.app`
- player architectures: `x86_64` and `arm64`
- signing: local ad-hoc signature
- notarization: not performed by RouteVN Creator
- installer image: no DMG in the initial implementation

Export-host capability is based on macOS and the presence of the bundled
universal player template. It must not be restricted to one Mac CPU
architecture.

The macOS export action should be unavailable on Windows and Linux. This is a
deliberate product boundary, not a limitation of the universal player itself.

## User Experience

The user selects a version, chooses **Export for macOS**, chooses a destination,
and receives a ZIP containing the game application.

The export does not ask for or require:

- an Apple Developer account
- an Apple ID
- an Apple signing certificate
- Xcode
- Rust or Cargo
- Tauri tooling
- Bun or Node.js
- other separately installed packaging tools

RouteVN Creator owns the packaging work and uses the universal template shipped
with the application. Standard macOS system utilities may be used internally.

The result is intentionally not Developer ID signed or notarized. When it is
downloaded or transferred to another Mac, Gatekeeper may identify it as coming
from an unknown developer and require the recipient to approve opening it in
Privacy & Security.

A creator who wants ordinary public distribution without that warning can
later use their own Developer ID credentials to sign and notarize the exported
application. That workflow is separate from the initial RouteVN export.

## Why Both Mac Architectures Can Export

The export host does not compile the player. RouteVN maintainers build the
universal player template in advance, with both executable slices included.
The local export operation only assembles project data and customizes that
template.

Both Intel and Apple silicon Macs provide the native bundle and signing tools
needed to finish the application. An Intel Mac cannot execute the `arm64` slice
for local testing, but it can package and sign a universal application.

## Why Windows And Linux Are Excluded

Most assembly work is portable, but the completed application must be signed
again after RouteVN changes its resources, metadata, and icon. A macOS app
signature seals bundle resources, so retaining the original template bundle
signature after those changes is not valid.

macOS supplies the signing, bundle archiving, and icon tooling needed for the
simple local workflow. Supporting Windows or Linux export hosts would require
RouteVN to implement or bundle cross-platform equivalents for Apple bundle
signing, ICNS generation, plist editing, and permission- and symlink-preserving
archives. Those tools could be embedded in Creator, but would add dependencies,
application size, maintenance work, and a larger validation matrix.

The initial implementation intentionally avoids that cost.

## Packaging Architecture

The Windows player currently stores its encrypted project package at the end of
the executable. The macOS player must not append data to its Mach-O executable,
because changing the executable conflicts with its code signature.

The macOS application instead stores the encrypted package as a bundle
resource:

```text
Game.app/
└── Contents/
    ├── MacOS/
    │   └── routevn-player
    └── Resources/
        └── routevn-package.bin
```

The export flow is:

```text
bundled universal player template ZIP
  -> expand into a temporary directory
  -> create the version's package.bin
  -> write an encrypted standalone package resource
  -> update the app name, Info.plist, version, identifier, and icon
  -> ad-hoc sign the completed app bundle
  -> verify the local signature
  -> create <game-name>-mac.zip atomically
```

The shipped template should itself be stored as an archive rather than as a
nested `.app` resource inside RouteVN Creator. This avoids nested application
signing problems and preserves the template's bundle layout and executable
permissions.

Proposed resource path:

```text
src-tauri/assets/player-templates/macos/RouteVNPlayerTemplate.app.zip
```

## Template Build And Release Work

Add a maintainer-only pipeline equivalent to the existing Windows player
template build:

1. Build the Tauri player for `universal-apple-darwin`.
2. Confirm that all shipped native code has the required architectures.
3. Validate the player on both an Intel Mac and an Apple silicon Mac.
4. Archive the `.app` while preserving executable permissions and symlinks.
5. Install the resulting template ZIP under the Creator resource directory.
6. Decide whether the binary artifact is committed with Git LFS or supplied by
   the release pipeline.

Ordinary RouteVN users never run this template build.

## Native Export Work

Add a macOS export module under `src-tauri/src/`, expected to be
`export_macos.rs`, and register its commands in `src-tauri/src/lib.rs`.

The native interface should provide:

- a host-capability query
- an export command that writes the final ZIP to a selected path

The export command is responsible for:

- validating trusted template and destination paths
- creating `package.bin` with the existing production exporter
- writing the encrypted standalone package resource
- expanding the trusted template into a temporary directory
- applying the stable application identifier and native version fields
- installing the project icon as an ICNS resource
- renaming the application bundle safely
- ad-hoc signing the finished bundle from the inside out as required
- verifying the resulting signature
- creating the final ZIP atomically
- cleaning temporary output after success or failure
- returning stable, user-facing errors and export statistics

The implementation may use macOS-provided tools such as `codesign`, `ditto`,
`sips`, and `iconutil`. Structured `Info.plist` editing may use a small Rust
plist library if that is more reliable than invoking another system utility.

## Encrypted Package And Player Runtime Work

Generalize `crates/routevn-packager/src/payload.rs` so the existing encrypted,
chunked package format can also live in a standalone file. Existing Windows
append-to-executable APIs and tests must remain compatible.

The player shell should resolve the package source by platform:

- Windows: the current executable, preserving existing behavior
- macOS: `Contents/Resources/routevn-package.bin`

The JavaScript-facing metadata and ranged-read command contract should remain
the same so the bundle runtime does not need separate package readers.

The macOS player should reuse the native SQLite persistence host. It must not
load the Windows-only custom window chrome. Prefer a shared native-player HTML
configuration with platform-specific additions over duplicating the complete
player document.

## Native Runtime Persistence

The exported macOS player must use native filesystem-backed persistence, not
browser IndexedDB or browser local storage. This does not require a new macOS
storage design: the existing Windows player host is already a JavaScript
adapter over the cross-platform Tauri SQL plugin.

The shared native persistence path is:

```text
Route Engine persistence interface
  -> native player JavaScript persistence host
  -> shared JavaScript SQLite KV client
  -> Tauri SQL plugin
  -> sqlite:runtime.db
```

On macOS, the Tauri SQL plugin resolves `sqlite:runtime.db` under the
application's native config directory. Conceptually, the database is stored
under the user's macOS Application Support data for the exported game's
`CFBundleIdentifier`. The adapter must continue to pass only the relative
SQLite URL and must not construct a macOS filesystem path itself.

The macOS-specific work is limited to wiring and validation:

- inject `player-runtime-persistence-host.js` before `main.js` in the macOS
  player document
- do not inject the Windows-only `windowChrome.js`
- retain `tauri_plugin_sql` in the universal player template
- retain the SQL load, execute, select, and close capabilities
- stamp a stable, unique `CFBundleIdentifier` for every game so different games
  do not share `runtime.db`
- verify save, load, clear, and upgrade behavior on both Intel and Apple silicon
  Macs

The implementation should rename Windows-specific persistence test and adapter
descriptions where the behavior is actually shared by all native players. The
stored schema and Route Engine persistence contract must remain compatible with
the existing Windows native player. There is no browser-storage import,
migration, fallback, or dual-write path in the macOS player.

## Application Identity

Every exported game needs a stable, unique native application identifier. On
macOS this value becomes `CFBundleIdentifier` and determines the native
application data location used for the player's SQLite saves.

Required invariants:

- all releases of one game keep the same identifier
- renaming the game does not change its identifier
- moving the application does not change its identifier
- different games never share an identifier

Before implementation, add or approve a persisted project metadata field such
as `nativeApplicationIdentifier`. Generating it once and storing the exact value
is preferred to deriving it differently during each export. This work should
also be suitable for resolving the corresponding known Windows template
identity collision.

The native application version also needs an explicit numeric contract.
Free-form release names must not be copied directly into
`CFBundleShortVersionString` or `CFBundleVersion`. The initial implementation
may derive stable numeric values from the release/action index, or the product
may introduce a dedicated release-version field before export work begins.

## Service And UI Work

Extend the Tauri project-service adapter and shared export facade with macOS
operations equivalent to:

```text
getMacosExportAvailability
promptMacosAppZipPath
createMacosAppZipToPath
```

The Versions page needs:

- macOS export availability state and selectors
- availability refresh during page setup
- an Export for macOS action in desktop and mobile layouts
- destination selection and cancellation behavior
- progress, completion, and stable failure feedback
- localized copy in English, Japanese, and Simplified Chinese

The UI must use the real capability response rather than treating every Tauri
runtime as capable of macOS export.

Primary implementation areas:

- `src/deps/services/shared/projectExportService.js`
- `src/deps/services/shared/projectServiceCore.js`
- `src/deps/services/tauri/projectServiceAdapters.js`
- `src/pages/versions/versions.store.js`
- `src/pages/versions/versions.handlers.js`
- `src/pages/versions/versions.view.yaml`
- `src/pages/versions/support/versionsPageCopy.js`
- `src/i18n/*.yaml`
- `src-tauri/src/lib.rs`
- `src-tauri/src/export_macos.rs`
- `crates/routevn-packager/src/payload.rs`
- `crates/routevn-packager/tauri-shell/src-tauri/src/lib.rs`

## Dependency Boundary

The ordinary user's machine gains no separately installed dependencies.

Expected repository impact:

- no new JavaScript package is expected
- existing Rust encryption, ZIP, and temporary-file dependencies cover most of
  the exporter
- a small Rust plist dependency is optional
- the universal template ZIP increases the RouteVN Creator application and
  download size
- macOS system utilities are invoked only on supported macOS export hosts

The implementation must not fall back to `cargo tauri build` during each game
export.

## Validation

Required automated coverage includes:

- standalone encrypted payload round trips and ranged reads
- regression coverage for the Windows appended payload
- application-name, identifier, version, and path validation
- capability results on supported and unsupported hosts
- Versions store, handler, view, cancellation, and error flows
- export service delegation and metadata forwarding

Required macOS integration coverage includes:

- exporting on Apple silicon
- exporting on Intel
- expanding the generated ZIP to one valid `.app`
- confirming `arm64` and `x86_64` slices in all relevant native code
- verifying the ad-hoc signature
- launching and reading the packaged project on both Mac architectures
- confirming that two different games do not share native save storage

## Deferred Work

The initial implementation does not include:

- export from Windows or Linux
- Developer ID certificate selection or storage
- signing with a user's Developer ID identity
- automatic Apple notarization or stapling
- DMG creation
- Mac App Store packaging
- rebuilding the Tauri player during game export

If Developer ID signing and notarization are added later, they should be an
explicit post-export workflow owned by the creator and kept separate from the
certificate-free local export described here.

## References

- Existing Windows template build: `scripts/build-windows-player-template.js`
- Existing Windows native export: `src-tauri/src/export_windows.rs`
- Existing macOS Creator release build: `scripts/tauri-build-mac.sh`
- Creator signing runbook: `docs/runbooks/macos-signing-and-notarization.md`
- Native player persistence contract:
  `docs/platform/11-windows-player-runtime-persistence.md`
- Apple universal binary overview:
  https://developer.apple.com/documentation/apple-silicon/building-a-universal-macos-binary
- Apple code-signing resource model:
  https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/Procedures/Procedures.html
