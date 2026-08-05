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
produced locally and committed as a regular Git file. CI does not build or
publish the macOS player template.

The public Creator release pipeline expands that source archive into a
temporary directory, signs its nested code and app with the maintainer's
Developer ID identity, hardened runtime, and a secure timestamp, and verifies
both architecture slices. It then writes an ignored release-only archive under
`.artifacts/` and overrides the Tauri resource source while preserving the
runtime path above. Apple notarization inspects code inside nested archives, so
signing only the outer Creator app is insufficient.

The template executable name stays stable. Export changes only the outer app
directory, top-level bundle metadata, resources, and signature.

## Identity And Versioning

The editable `platformDetails.macos.applicationIdentifier` is written to
`CFBundleIdentifier`. Before plugins initialize, the player shell reads that
value from its stamped `Info.plist`, validates it, and assigns it to Tauri's
runtime `config.identifier`. New macOS Platform Details start with this field
blank, and export requires the user to enter a valid reverse-domain identifier.

This makes the bundle identifier and the native SQLite location agree:

```text
~/Library/Application Support/<applicationIdentifier>/runtime.db
```

The user must keep the identifier stable across releases that should share
saves. Changing it intentionally creates a different app/save identity.

The export confirmation requires two release-specific values. Version is
prefilled from the selected RouteVN version name and must contain three numeric
components. Build Number starts blank and must be entered manually as a
positive integer for every export. These values are not stored in macOS
Platform Details:

```text
CFBundleShortVersionString = <entered Version>
CFBundleVersion            = <entered Build Number>
```

If a free-form RouteVN version name is not already a three-component numeric
version, the user must edit the prefilled value before export. No build number
is inferred from project history.

macOS Platform Details currently contains only application name, icon, and
bundle identifier. Publisher, description, copyright, and application category
are intentionally omitted from the product UI and export workflow until those
optional metadata fields have a defined product workflow. Existing stored
values are preserved unchanged while hidden.

The player also replaces Tauri's compiled template package name and version
with `CFBundleDisplayName` and `CFBundleShortVersionString` before the native
menu is created. The macOS About dialog therefore shows the exported
application name and configured version instead of `RouteVN Shell` and the
template crate version.

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

The exported runtime registers capture-phase pointer, touch, and keyboard
listeners that resume its Web Audio context directly from a native user
interaction. This preserves automatic player startup while allowing packaged
MP3, Ogg, WAV, and other supported audio to play under WebKit's audio policy.

## Export Transaction

The native exporter:

1. validates host capabilities, trusted template path, destination, metadata,
   project icon, and package bytes
2. expands exactly `RouteVNPlayerTemplate.app` with `ditto`
3. rejects unsafe or escaping symlinks and non-universal Mach-O files
4. removes all template code signatures before changing the application
5. writes the encrypted standalone package resource
6. stamps top-level plist metadata and installs the ICNS icon
7. ad-hoc signs nested native code deepest-first and the application last
8. verifies every architecture is exclusively ad-hoc signed and contains no
   retained Developer ID certificate payload
9. verifies the strict signature, metadata, architectures, permissions, and
   symlinks
10. creates a sibling `.part` archive with `ditto`, expands and validates it,
    then atomically renames it to the selected destination

The native command reports elapsed-time progress throughout those stages. Asset
scanning, image optimization, and package writing use determinate counts; app
preparation, encryption, signing, verification, and archiving use named
indeterminate stages in the same managed progress dialog as Web export.

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
no-op; active export forwards native progress through the shared service to the
managed progress dialog and uses stable localized toast messages.

## Canonical Implementation Areas

- template build: `scripts/build-macos-player-template.js`
- release signing: `scripts/prepare-macos-player-template-release.js`
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
