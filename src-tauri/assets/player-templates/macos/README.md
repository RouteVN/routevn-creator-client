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

The GitHub Actions workflow `macos-player-template.yaml` builds and uploads the
template artifact for release use.
