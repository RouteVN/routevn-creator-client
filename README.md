
# RouteVN Creator Client

RouteVN Creator Client is a frontend application for building Visual Novels with a drag & drop visual UI, without needing to write any code.

This is a complete **Single Page Application (SPA)** that operates **offline-first** using localStorage persistence through the Repository system.

## Frameworks used

- [@rettangoli/fe](https://github.com/yuusoft-org/rettangoli/tree/main/packages/rettangoli-fe) - Is used as the frontend framework
- [@rettangoli/ui](https://github.com/yuusoft-org/rettangoli/tree/main/packages/rettangoli-ui) - Is used as the UI library
- [Repository](docs/Repository.md) - Is used as the state management system (enables offline-first functionality)

## External Dependencies

- [RouteVN API](https://github.com/yuusoft-org/routevn-api) - You need to run this backend project in order to use the APIs

## Project Structure

Entrypoint defined in `static/index.html` with the `<rvn-app>` tag.

`src/pages/app/` - **Application entrypoint**

Folder structure

- `src/components/` - Reusable UI components
<!-- TODO better differenciate component and pages -->
- `src/pages/` - Global components with their own state
- `src/deps/` - Custom utilities that will be accessible via deps
- `static/` - Static HTML files and assets
- `_site/` - Build output directory

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

Run the project in watch mode:
```shell
bun run watch
```

Or build project and serve without watch mode:

```shell
bun run build
bunx serve _site
```

Open: http://localhost:3000/project

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

# Fedora/RHEL:
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file libappindicator-gtk3-devel librsvg2-devel

# macOS and Windows: No additional system dependencies needed
```

**Development:**

Run the Tauri app in development mode:
```shell
bun run tauri:dev
```

For cross-compilation to Windows from Linux/macOS:
```shell
bun run tauri:dev:win
```

**Building:**

Build the desktop application:
```shell
bun run tauri:build
```

Cross-compile for Windows:
```shell
bun run tauri:build:win
```

The built application will be available in `src-tauri/target/release/` with platform-specific installers in `src-tauri/target/release/bundle/`.

**Platform Support:**
- **Windows**: `.exe` installer and `.msi` package
- **macOS**: `.app` bundle and `.dmg` installer  
- **Linux**: `.AppImage`, `.deb`, and `.rpm` packages

**Features:**
- Native file system access
- Better performance than web version
- Offline-first with local storage
- System tray integration (planned)
- Auto-updates support (planned)
