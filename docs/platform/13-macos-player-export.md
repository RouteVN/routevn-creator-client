# 13 macOS Player Export

Date baseline: July 15, 2026.

Status: implemented. Apple-silicon export, archive, launch, and persistence
acceptance passes locally. Intel-host launch acceptance remains required before
release.

## Product Contract

RouteVN Creator exports one `<game>.app.zip` containing one universal macOS
application. Export is available only from a macOS Creator host with the
bundled template and the required system tools. It does not run Cargo, require
Xcode, use a Developer ID certificate, or notarize the result.

The player is ad-hoc signed. A transferred archive may therefore require the
recipient to approve opening the application in macOS Privacy & Security.

## Bundled Template

Creator ships this release-built resource:

```text
player-templates/macos/RouteVNPlayerTemplate.app.zip
```

The maintainer pipeline builds `universal-apple-darwin`, validates that every
Mach-O contains `arm64` and `x86_64`, checks executable permissions and symlink
containment, and archives the template with `ditto`. The exact archive is
committed as a regular Git file and uploaded by the template workflow.

The template executable name stays stable. Export changes only the outer app
directory, top-level bundle metadata, resources, and signature.

## Identity And Versioning

Every project owns a stable `projectInfo.nativeApplicationIdentifier`. The
exporter writes it to `CFBundleIdentifier`. Before plugins initialize, the
player shell reads that value from its stamped `Info.plist`, validates it, and
assigns it to Tauri's runtime `config.identifier`.

This makes the bundle identifier and the native SQLite location agree:

```text
~/Library/Application Support/<nativeApplicationIdentifier>/runtime.db
```

Native versions are derived deterministically from the selected version's
non-negative `actionIndex`:

```text
CFBundleShortVersionString = 1.0.<actionIndex>
CFBundleVersion            = <actionIndex + 1>
```

Release display names are not copied into native version fields.

## Package Resource

The shared chunked encrypted payload format supports both an executable prefix
and an empty prefix. Windows keeps the appended executable layout. macOS writes
the same self-contained chunk table, encrypted segments, key envelope, and
footer to:

```text
<game>.app/Contents/Resources/routevn-package.bin
```

The shell resolves this resource on macOS while retaining the existing current
executable source on Windows. JavaScript metadata and ranged-read commands are
the same on both platforms.

## Export Transaction

The native exporter:

1. validates host capabilities, trusted template path, destination, metadata,
   project icon, and package bytes
2. expands exactly `RouteVNPlayerTemplate.app` with `ditto`
3. rejects unsafe or escaping symlinks and non-universal Mach-O files
4. writes the encrypted standalone package resource
5. stamps top-level plist metadata and installs the ICNS icon
6. signs nested native code deepest-first and the application last
7. verifies the strict signature, metadata, architectures, permissions, and
   symlinks
8. creates a sibling `.part` archive with `ditto`, expands and validates it,
   then atomically renames it to the selected destination

Icon assembly first builds the standard iconset and uses `iconutil`. A direct
system `sips` ICNS conversion is retained as a compatibility fallback for
macOS hosts where `iconutil` rejects an otherwise valid generated iconset.

Temporary output is isolated and removed after success or failure. Existing
destination archives are not replaced until final verification succeeds.

## Creator Boundary

The shared project export facade exposes:

- `getMacosExportAvailability`
- `promptMacosApplicationPath`
- `createMacosApplicationToPath`

The Versions page refreshes real host/template/tool availability and shows the
macOS action only for a capable Tauri host. Destination cancellation is a
no-op; active export uses the shared progress state and stable localized toast
messages.

## Canonical Implementation Areas

- template build: `scripts/build-macos-player-template.js`
- template workflow: `.github/workflows/macos-player-template.yaml`
- native exporter: `src-tauri/src/export_macos.rs`
- shared payload: `crates/routevn-packager/src/payload.rs`
- shared player shell:
  `crates/routevn-packager/tauri-shell/src-tauri/src/lib.rs`
- Tauri adapter: `src/deps/services/tauri/projectServiceAdapters.js`
- shared export facade: `src/deps/services/shared/projectExportService.js`
- Versions workflow: `src/pages/versions/`

## Release Gate

Before release, run the export, launch, identity isolation, and same-project
save-reuse matrix on both Apple silicon and Intel Macs. Universal Mach-O
validation proves both slices are present, but it does not replace a real
Intel-host launch and persistence check.
