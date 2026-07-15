# macOS Player Export Plan

Status: implemented locally; Intel-host acceptance remains a release gate.

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

Archive handling is part of the native macOS contract:

- use macOS `ditto` for template expansion and final ZIP creation so executable
  permissions and symlinks are preserved
- require the trusted template archive to expand to exactly one expected `.app`
  bundle and reject unexpected top-level entries
- reject symlinks that resolve outside the expanded application bundle
- never use the existing generic Rust ZIP extractor for the application
  template; it does not preserve the required macOS bundle metadata
- create the final archive beside the selected destination with a temporary
  suffix and rename it into place only after signing and archive validation
- exclude quarantine, ACL, resource-fork, and unrelated extended-attribute
  metadata from the distributable ZIP so its only top-level entry is the game
  application rather than an additional `__MACOSX` metadata directory

## Template Build And Release Work

Add a maintainer-only pipeline equivalent to the existing Windows player
template build:

1. Build the shared native player frontend without `windowChrome.js`.
2. Build the Tauri player for `universal-apple-darwin`.
3. Confirm that the main executable and every shipped Mach-O library contain
   both `x86_64` and `arm64` slices.
4. Confirm the template contains the SQL plugin and required capabilities.
5. Validate the player on both an Intel Mac and an Apple silicon Mac.
6. Archive the `.app` with `ditto`, preserving executable permissions and
   symlinks while excluding quarantine and unrelated host metadata.
7. Record the template's player-shell version and SHA-256 digest in the build
   output so Creator release assembly can verify the intended artifact.
8. Install the resulting template ZIP under the Creator resource directory.
9. Commit the binary artifact as a regular Git file, matching the existing
   Windows player-template policy.

Expected maintainer-facing additions include a macOS template build script, a
package script equivalent to `player-template:build:win`, and the exact locally
built template archive consumed by Creator releases. CI does not build or
publish the macOS player template.

Ordinary RouteVN users never run this template build.

## Native Export Work

Add a macOS export module under `src-tauri/src/`, expected to be
`export_macos.rs`, and register its commands in `src-tauri/src/lib.rs`.

The native interface should provide:

- a host-capability query
- an export command that writes the final ZIP to a selected path

The capability response must distinguish at least:

- whether the host OS is supported
- whether the bundled template exists
- whether required macOS system tools are available
- the final combined `available` result

Both Intel and Apple silicon macOS hosts are supported. CPU architecture must
not be used as a reason to hide the action.

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
- validating that the expanded archive contains exactly the expected signed
  application bundle
- creating the final ZIP atomically
- cleaning temporary output after success or failure
- returning stable, user-facing errors and export statistics

Invoke macOS-provided tools such as `/usr/bin/codesign`, `/usr/bin/ditto`,
`/usr/bin/sips`, and `/usr/bin/iconutil` directly without a shell. Pass every
path as a separate process argument. Use a Rust plist library for structured
`Info.plist` reads and writes rather than text replacement or shell-based
PlistBuddy commands.

The project icon is required for the initial export, matching the current
Windows native-export behavior. Validate that the stored icon exists and is a
square supported image before invoking native tools. Build a complete `.iconset`
at the standard macOS sizes and convert it to one ICNS file with `iconutil`.

The exporter should update only the intended top-level application metadata:

- `CFBundleDisplayName`
- `CFBundleName`
- `CFBundleIdentifier`
- `CFBundleShortVersionString`
- `CFBundleVersion`
- `CFBundleIconFile`

The main executable name should remain the stable template executable name.
Only the outer `.app` directory and user-visible bundle metadata are renamed.

Signing must be explicit rather than relying on `codesign --deep` to discover
work. Sign known nested code from the deepest level outward, sign the top-level
application last with the ad-hoc identity, and verify with
`codesign --verify --strict --verbose=2`. The exporter must remove or
replace stale template signatures as part of this process. Template
entitlements, if any are introduced, must be reviewed and applied deliberately;
they must not be inherited accidentally from an unrelated Creator build.

## Encrypted Package And Player Runtime Work

Generalize `crates/routevn-packager/src/payload.rs` so the existing encrypted,
chunked package format can also live in a standalone file. Existing Windows
append-to-executable APIs and tests must remain compatible.

Keep one payload reader and one chunked container contract. The generalized
writer should accept optional prefix bytes:

- Windows supplies the branded executable as the prefix and preserves the
  current append-to-executable output byte for byte
- macOS supplies an empty prefix and writes the same self-contained chunk
  table, footer, key envelope, and encrypted segments to
  `routevn-package.bin`

Do not introduce a second JavaScript package format or decrypt the complete
package into memory at player startup. Metadata and ranged reads must continue
to operate on the encrypted file.

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

On macOS, the Tauri SQL plugin resolves `sqlite:runtime.db` under Tauri's
application config directory. The pinned Tauri runtime builds that path from
its in-memory `config.identifier`; it does not read `CFBundleIdentifier` again
when the SQL database is opened. The adapter must continue to pass only the
relative SQLite URL and must not construct a macOS filesystem path itself.

Stamping `Info.plist` is therefore necessary but not sufficient. Before
initializing the packaged Tauri application runtime, the macOS player shell
must:

1. read the stamped `CFBundleIdentifier` from its own application bundle
2. validate it against the native application identifier contract
3. assign it to `tauri::generate_context!().config_mut().identifier`
4. start the Tauri builder with that updated context

This keeps the macOS bundle identifier, Tauri path identity, WebView identity,
and SQL persistence directory aligned. Failure to load or validate the stamped
identifier must stop startup; the shell must not silently fall back to the
template identifier. An unbundled debug or test shell may accept an explicit
injected identifier, but production packaged startup may not use that escape
hatch.

The macOS-specific work is limited to wiring and validation:

- inject `player-runtime-persistence-host.js` before `main.js` in the macOS
  player document
- do not inject the Windows-only `windowChrome.js`
- retain `tauri_plugin_sql` in the universal player template
- retain the SQL load, execute, select, and close capabilities
- stamp and load one stable native identifier for every game so different games
  do not share `runtime.db`
- verify save, load, clear, and upgrade behavior on both Intel and Apple silicon
  Macs

The implementation should rename Windows-specific persistence test and adapter
descriptions where the behavior is actually shared by all native players. The
stored schema and Route Engine persistence contract must remain compatible with
the existing Windows native player. There is no browser-storage import,
migration, fallback, or dual-write path in the macOS player.

## Application Identity

Every exported game needs a stable, unique native application identifier. Add
`nativeApplicationIdentifier` to the project-specific `projectInfo` record. On
macOS the exact stored value becomes both `CFBundleIdentifier` and Tauri's
runtime `config.identifier`.

Required invariants:

- all releases of one game keep the same identifier
- renaming the game does not change its identifier
- moving the application does not change its identifier
- different games never share an identifier
- reopening, moving, or restoring the same project preserves its identifier
- an explicit future "duplicate as new game" operation must create a new
  identifier
- the value uses reverse-domain form and contains only ASCII letters, digits,
  hyphens, and periods

New projects should generate and persist a value in the form
`vn.routevn.player.<base58>` through the centralized ID helper, using the
existing default 12-character Base58 suffix. Existing projects should receive
the field through one lazy, persisted backfill when `projectInfo` is read.
Export must use the stored value directly and must never derive it from the
project name, file path, release name, or export destination.

Because this introduces a new prefixed/composite ID use case, update
`docs/platform/08-id-generation.md` in the same implementation change. Update
project metadata documentation, creation paths, normalizers, import/export
round trips, and platform adapters together so no platform silently drops the
field.

The field is intentionally platform-neutral and should later be used to fix the
known Windows template save-identity collision. The macOS work must preserve
that path, but Windows runtime identifier stamping is a separately testable
packaging change and is not required to make the first macOS export usable.

## Native Version Contract

Release names remain free-form product text and must not be copied into native
version fields. For the initial macOS export, derive both native values from the
version's non-negative integer `actionIndex`:

```text
CFBundleShortVersionString = 1.0.<actionIndex>
CFBundleVersion            = <actionIndex + 1>
```

This produces Apple's required three-integer user-visible version and a
positive numeric build version without adding a new release form field. The
mapping is deterministic for a saved version and later versions naturally
increase as the project action index advances. Reject missing, negative,
non-integer, or unsafe values before opening the native export command.

If the product later adds explicit semantic release versions, that is a data
model and UI migration. It must replace this mapping deliberately rather than
changing existing exports implicitly.

## Service And UI Work

Extend the Tauri project-service adapter and shared export facade with macOS
operations equivalent to:

```text
getMacosExportAvailability
promptMacosApplicationPath
createMacosApplicationToPath
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

- `src/internal/nativeApplicationIdentifier.js` or the approved equivalent
- `docs/platform/06-project-identity-and-metadata.md`
- `docs/platform/08-id-generation.md`
- `src/deps/services/shared/projectRepositoryService.js`
- project-creation paths in `src/deps/services/*/appService.js`
- project-info normalizers in the web, Tauri, Android, and iOS adapters
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
- `scripts/build-macos-player-template.js`
- relevant service, Versions, project metadata, and player-shell tests

## Dependency Boundary

The ordinary user's machine gains no separately installed dependencies.

Expected repository impact:

- no new JavaScript package is expected
- existing Rust encryption, ZIP, and temporary-file dependencies cover most of
  the exporter
- a small Rust plist dependency is expected for safe `Info.plist` editing and
  player-shell startup identity loading
- the universal template ZIP increases the RouteVN Creator application and
  download size
- macOS system utilities are invoked only on supported macOS export hosts

The implementation must not fall back to `cargo tauri build` during each game
export.

## Implementation Phases And Gates

### Phase 1: Identity And Version Contracts

- add and backfill `projectInfo.nativeApplicationIdentifier`
- preserve the field through every platform adapter and project import path
- document the identifier format and native ownership
- add the shared `actionIndex` to macOS version mapping

Gate: two projects receive different valid identifiers; reopening, renaming,
and exporting the same project preserves its identifier and version mapping.

### Phase 2: Payload And Player Runtime

- generalize the chunked encrypted payload writer for empty-prefix standalone
  files while preserving Windows output
- resolve the payload source by platform in the player shell
- add the shared native-player HTML configuration
- load the stamped macOS identifier into the Tauri context before startup

Gate: Rust tests cover whole and ranged reads for both standalone and appended
payloads, and a shell-level test proves the runtime identifier is not
`vn.routevn.shell` after stamping.

### Phase 3: Universal Template Pipeline

- add the local macOS staging/build script
- validate every Mach-O architecture and required SQL capability
- produce the digest-recorded template ZIP consumed by Creator

Gate: the exact archive expands to one launchable universal player application
on both supported Mac architectures.

### Phase 4: Native Exporter

- implement capability detection, plist/icon customization, signing,
  verification, archive creation, cleanup, and atomic destination replacement
- return stable result statistics and error categories

Gate: an Apple-silicon Creator build exports and launches a valid universal
application without Cargo, Xcode, or developer credentials installed for the
user workflow.

### Phase 5: Service And Versions UI

- expose the macOS facade and adapter methods
- wire availability, export actions, progress, cancellation, success, and
  stable errors into desktop and mobile layouts
- add aligned English, Japanese, and Simplified Chinese catalogs

Gate: automated service/store/handler/view coverage passes and VT covers the
visible Versions workflow.

### Phase 6: Cross-Architecture Acceptance

- run the complete export and runtime persistence matrix on Intel and Apple
  silicon Macs
- verify application identity isolation with two different exported games
- verify a later export of the same game reuses its save database

Gate: all integration checks in the Validation section are recorded for both
architectures before release.

## Validation

Required automated coverage includes:

- standalone encrypted payload round trips and ranged reads
- regression coverage for the Windows appended payload
- byte-for-byte Windows payload compatibility for unchanged fixtures
- project metadata creation, lazy backfill, reopen, rename, import, and
  cross-adapter preservation of `nativeApplicationIdentifier`
- application-name, identifier, version, and path validation
- capability results on supported and unsupported hosts
- player-shell propagation from stamped `CFBundleIdentifier` to Tauri runtime
  `config.identifier`
- Versions store, handler, view, cancellation, and error flows
- export service delegation and metadata forwarding

Required macOS integration coverage includes:

- exporting on Apple silicon
- exporting on Intel
- expanding the generated ZIP to one valid `.app`
- confirming `arm64` and `x86_64` slices in all relevant native code
- verifying the ad-hoc signature
- verifying the final ZIP preserves executable permissions and symlinks
- launching and reading the packaged project on both Mac architectures
- confirming that two different games do not share native save storage
- confirming that multiple releases of one game do share native save storage

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
- Tauri identifier contract:
  https://v2.tauri.app/reference/config/#identifier
- Apple bundle build-version contract:
  https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundleversion
- Apple bundle short-version contract:
  https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundleshortversionstring
- Apple universal binary overview:
  https://developer.apple.com/documentation/apple-silicon/building-a-universal-macos-binary
- Apple code-signing resource model:
  https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/Procedures/Procedures.html
