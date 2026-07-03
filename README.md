# RouteVN Creator Client

[Official Website](https://routevn.com/creator/about/)

RouteVN Creator Client is a frontend application for building Visual Novels with a drag & drop visual UI, without needing to write any code.

This is a complete **Single Page Application (SPA)** that operates **offline-first**.

Browser builds persist project data through IndexedDB-backed stores.

Desktop builds persist project data through Tauri/SQLite-backed stores.

Android builds run the web app inside a native WebView shell and persist project
data through the web/IndexedDB-backed stores. Tauri is not used for mobile.

## Frameworks used

- [@rettangoli/fe](https://github.com/yuusoft-org/rettangoli/tree/main/packages/rettangoli-fe) - Is used as the frontend framework
- [@rettangoli/ui](https://github.com/yuusoft-org/rettangoli/tree/main/packages/rettangoli-ui) - Is used as the UI library
- [Product](docs/product.md) - Product principles and UX contract
- [Engineering](docs/engineering.md) - Code structure, stack, and engineering boundaries
- [Platform Spec](docs/platform/README.md) - Current project model, command/event flow, and storage contracts
- [Docs Index](docs/README.md) - Entry point for internal documentation

## Project Structure

Entrypoint defined in `static/index.html` with the `<rvn-app>` tag.

See [docs/README.md](docs/README.md) for the internal docs index, [docs/product.md](docs/product.md) for product principles, and [docs/engineering.md](docs/engineering.md) for the engineering guide.

`src/pages/app/` - **Application entrypoint**

Folder structure

- `src/components/` - Reusable UI components
- `src/pages/` - Global components with their own state
- `src/deps/` - Infrastructure and service dependencies injected into pages/components
- `src/setup.web.js` - Web-specific configuration
- `src/setup.tauri.js` - Tauri desktop-specific configuration
- `src/setup.android.js` - Android WebView-specific configuration
- `android/routevn/` - Native Android WebView shell
- `src/domain/` - Domain rules, command processing, and state projection
- `src/collab/` - Collaboration runtime
- `scripts/` - Build and utility scripts
- `static/` - Static HTML files and assets
- `_site/` - Build output directory

There is no shared `src/setup.common.js` entrypoint today. Shared runtime code lives behind service cores and adapters.

## Adding Routes

To add a new route, you need to update 3 files:

1. **Create HTML file in `static/`** - Add the static HTML file for the route
2. **Update `src/pages/app/app.view.yaml`** - Add the route condition and component
3. **Update `src/pages/app/app.store.js`** - Add the route pattern to the arrays

Example for adding `/project/new-feature`:

```yaml
# In app.view.yaml
$elif currentRoutePattern == "/project/new-feature":
  - rvn-new-feature: []
```

```javascript
// In app.store.js - add to both routePatterms and routesWithNavBar arrays
"/project/new-feature",
```

## Development

Install `rtgl` cli

```shell
npm i -g rtgl
```

Install dependencies:
```shell
bun install
```

**Setup Git Hooks (Required for new developers):**

After installing dependencies, Husky will automatically set up git hooks. The pre-push hook will run `bun run lint` to ensure code quality before pushing changes.

If you're setting up the project for the first time, make sure to run:
```shell
bun run prepare
```

This ensures all git hooks are properly configured.

**Note:** If you encounter errors when pushing due to linting issues, run:
```shell
bun run lint:fix
```

This will automatically fix most linting errors. After fixing, you can commit the changes and push again.

### Web Development

The project uses platform-specific entry points that are automatically configured during build:

Run the project in watch mode:
```shell
bun run watch:web
```

Or build project and serve without watch mode:

```shell
bun run build:web
bunx serve _site -p 3001
```

Open: http://localhost:3001/project

**Build Commands:**
- `bun run build` or `bun run build:web` - Build for web platform
- `bun run watch:web` - Watch mode for web development

### Desktop Application (Tauri)

RouteVN Creator also supports running as a native desktop application using [Tauri](https://tauri.app/), providing better performance and system integration.

**Prerequisites:**

Install Rust and system dependencies:
```shell
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Linux users need additional system dependencies
# Ubuntu/Debian:
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libayatana-appindicator3-dev librsvg2-dev

# Arch Linux:
sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget file openssl libayatana-appindicator librsvg

# Fedora/RHEL:
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file libappindicator-gtk3-devel librsvg2-devel

# macOS and Windows: No additional system dependencies needed
```

**Development:**

The Tauri build automatically uses the desktop-specific configuration (`src/setup.tauri.js`):

Add `env.dev` to your env variables. It is required to set the private key for the updater

Start dev server from:
```shell
bun run watch:tauri
```

Run the Tauri app in development mode:
```shell
bun run tauri:dev
```

For cross-compilation to Windows from Linux/macOS:
```shell
bun run tauri:dev:win
```

**Production Build:**

For production we build installer using NSIS: https://v2.tauri.app/distribute/windows-installer/

Build the desktop application:
```shell
bun run tauri:build
```

Build the Linux AppImage on the host:
```shell
bun run tauri:build:linux:appimage
```

Build the Linux AppImage in an Ubuntu 22.04 Docker builder for a more
compatible release baseline:
```shell
bun run tauri:build:linux:appimage:docker
```
The Docker-built AppImage, signature, and checksum are copied to
`dist/appimage/ubuntu-22.04/`.

Build Linux native packages in Docker:
```shell
bun run tauri:build:linux:deb:docker
bun run tauri:build:linux:rpm:docker
```
The Docker-built packages and checksums are copied to
`dist/linux-packages/ubuntu-22.04/` and `dist/linux-packages/fedora-43/`.

Cross-compile for Windows:
```shell
bun run tauri:build:win
```

Build and notarize the macOS DMG:
```shell
bun run tauri:build:mac
```

For the Apple signing and notarization setup, see [docs/runbooks/macos-signing-and-notarization.md](docs/runbooks/macos-signing-and-notarization.md).

The built application will be available in `src-tauri/target/release/` with platform-specific installers in `src-tauri/target/release/bundle/`.

**Build Commands:**
- `bun run build:tauri` - Build frontend for Tauri platform
- `bun run watch:tauri` - Watch mode for Tauri development
- `bun run tauri:build` - Build complete desktop application

**Platform Support:**
- **Windows**: `.exe` installer and `.msi` package
- **macOS**: `.app` bundle and `.dmg` installer  
- **Linux**: `.AppImage`, `.deb`, and `.rpm` packages

**Features:**
- Native file system access
- Better performance than web version
- Offline-first with local storage
- Platform-specific optimizations via separate entry points
- System tray integration (planned)
- Auto-updates support (planned)

### Android Application (WebView)

The Android app is a native WebView wrapper around the web build. It bypasses
Tauri entirely and loads packaged assets through AndroidX `WebViewAssetLoader`.

See [docs/android.md](docs/android.md) for the setup details and version pins.

```shell
bun run build:android
bun run android:install
```

## Community

Join us on [Discord](https://discord.gg/8J9dyZSu9C) to ask questions, report bugs, and stay up to date.

## License

- This project is licensed under the [MIT License](LICENSE).
- The name RouteVN, and its logo are the exclusive property of Yuusoft
