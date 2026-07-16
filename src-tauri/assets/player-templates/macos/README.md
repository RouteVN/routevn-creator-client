# macOS Player Template

The release-built universal macOS player template lives here as:

```text
RouteVNPlayerTemplate.app.zip
```

Creator resolves it at runtime as:

```text
player-templates/macos/RouteVNPlayerTemplate.app.zip
```

Build and validate it on macOS with:

```bash
bun run player-template:build:mac
```

The build stages the native player frontend, builds the shared Tauri shell for
`universal-apple-darwin`, verifies every Mach-O has both `arm64` and `x86_64`,
checks symlink containment and executable permissions, and archives the app
with `ditto`. The exporter re-validates the bundled template and the final
player archive.

The template is built locally and committed as a regular Git artifact. CI does
not build or publish it.

Public Creator builds do not bundle this archive directly. Running
`bun run tauri:build:mac` automatically expands it, Developer-ID-signs the
template with hardened runtime and a secure timestamp, verifies both universal
slices, and writes a release-only copy under `.artifacts/`. Exported player apps
have that release signature removed before customization, then are ad-hoc signed
and checked for retained Developer ID certificate data. Users therefore receive
neither an active RouteVN Developer ID signature nor its certificate payload.
