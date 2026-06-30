# Steam Release

This runbook covers the intended Steam release flow for RouteVN Creator.

The repository is public. Do not commit Steam credentials, SteamCMD auth
tokens, generated local VDF files, `steam_appid.txt`, or Steamworks SDK files.

## Goals

- Ship RouteVN Creator on Steam with the lightest possible integration.
- Let Steam handle distribution and updates for Steam users.
- Keep the existing direct-download Tauri updater for non-Steam builds.
- Avoid adding the Steamworks SDK unless a product feature requires it.
- Keep all credentials and private release metadata out of git.

## Current Decision

The first Steam build should not include Steamworks SDK integration.

Do not add:

- Steamworks SDK folders
- `steam_api64.dll`, `libsteam_api.so`, or `libsteam_api.dylib`
- Rust Steamworks crates
- `steam_appid.txt`
- Steam DRM wrapping

Add Steamworks SDK only when the app needs a Steam API feature such as Steam
Cloud, Workshop, overlay-specific behavior, achievements, stats, or ownership
checks.

## Repo Safety Rules

Allowed in git:

- Steam documentation
- VDF templates with placeholders
- scripts that generate local VDF files from environment variables
- packaging scripts that stage Steam upload content

Do not commit:

- Steam account usernames if they are not intended to be public
- Steam account passwords
- Steam Guard codes
- SteamCMD `config.vdf`
- generated `*.local.vdf`
- `_steam/` staged build output
- downloaded `steamcmd/` folders
- `steam_appid.txt`
- Steamworks SDK files
- Steam API runtime libraries copied from the SDK

Recommended future `.gitignore` entries:

```gitignore
_steam/
steam/*.local.vdf
steam/config.vdf
steamcmd/
steam_appid.txt
```

## Steam Concepts

`App ID`

- The Steam application id assigned in Steamworks.
- This is not a password.
- Keep it in environment variables or generated local files while the Steam
  page is private.

`Depot ID`

- A depot is a platform/content bucket under the Steam app.
- Typical first depots:
  - Windows 64-bit depot
  - macOS depot, if shipping macOS through Steam
  - Linux depot, if shipping Linux/Steam Deck through Steam

`Build`

- A SteamPipe build is a set of depot manifests uploaded for an app.
- Steam clients download only the depots that match their platform/package.

`Branch`

- A branch is a release channel such as `default`, `beta`, or `internal`.
- Use a private branch for first uploads and review builds.

`Launch Option`

- Steamworks Admin defines the command Steam launches after installing the app.
- This is configured in Steamworks, not in the VDF build scripts.

## Steamworks Admin Setup

1. Create a Steam Direct app credit.
2. Create the Steamworks app.
3. Categorize RouteVN Creator as `Software`, unless there is a deliberate
   product decision to list it as a game.
4. Create platform depots.
5. Configure launch options:
   - Windows: launch the staged `.exe`
   - macOS: launch the staged `.app`
   - Linux: launch the staged AppImage or Linux executable
6. Create a private branch for internal testing.
7. Complete store and build review checklists.
8. Keep the Coming Soon page visible for the required Steam period before
   public release.

## Steam-Specific Build Flavor

The Steam flavor should be separate from the existing direct-download Tauri
build.

Steam build files:

```text
src-tauri/tauri.steam.conf.json
scripts/tauri-build-win-steam.sh
scripts/tauri-build-mac-steam.sh
scripts/tauri-build-linux-steam.sh
steam/app_build.vdf.template
steam/depot_build_windows.vdf.template
```

Optional later files:

```text
steam/depot_build_macos.vdf.template
steam/depot_build_linux.vdf.template
```

### Updater Behavior

The existing direct-download build uses the Tauri updater:

- Rust plugin registration:
  `src-tauri/src/lib.rs`
- updater permissions:
  `src-tauri/capabilities/default.json`
- production updater endpoint:
  `src-tauri/tauri.prod.conf.json`
- frontend update checks:
  `src/deps/clients/tauri/updater.js`

The Steam build should not check RouteVN's updater endpoint.

Preferred implementation:

1. Keep using `src/setup.tauri.js`.
2. Read the build distribution from `import.meta.env.VITE_ROUTEVN_DISTRIBUTION`.
3. Pass `distribution` and `updatesEnabled` through page and component deps.
4. Skip automatic update checks when updates are disabled.
5. Hide manual update UI in Steam builds.
6. Set Tauri updater artifacts off in the Steam Tauri config.

Distribution setup shape:

```js
const rawDistribution = import.meta.env?.VITE_ROUTEVN_DISTRIBUTION;
const distribution = rawDistribution === "steam" ? "steam" : "direct";
const updatesEnabled = distribution !== "steam";
```

Pass those values through deps:

```js
const componentDependencies = {
  distribution,
  updatesEnabled,
  // ...
};

const pageDependencies = {
  distribution,
  updatesEnabled,
  // ...
};
```

The normal direct-download build does not need to set any environment variable.
Unset distribution defaults to `direct`.

The Steam build script should set:

```bash
export VITE_ROUTEVN_DISTRIBUTION=steam
bun run build:tauri
```

`VITE_` is required because Vite exposes only `VITE_*` environment variables to
frontend code. `rtgl fe build` uses Vite internally, and this mechanism was
validated with the actual Rettangoli build path:

```text
VITE_ROUTEVN_DISTRIBUTION=steam  -> distribution compiled as "steam"
VITE_ROUTEVN_DISTRIBUTION=direct -> distribution compiled as "direct"
unset                            -> falls back to "direct"
```

The generated bundle does not retain `import.meta.env` for set values. The
distribution value is public build metadata, not a credential.

No-op updater shape:

```js
const updater = {
  checkForUpdates: async () => undefined,
  downloadAndInstall: async () => undefined,
  startAutomaticChecks: () => undefined,
  getUpdateInfo: () => undefined,
  getDownloadProgress: () => 0,
  isUpdateAvailable: () => false,
};
```

Minimal Steam Tauri config overlay:

```json
{
  "bundle": {
    "createUpdaterArtifacts": false
  },
  "plugins": {
    "updater": {
      "endpoints": [],
      "dangerousInsecureTransportProtocol": false
    }
  }
}
```

Keeping the updater crate and Rust plugin registered is acceptable for the
first Steam flavor if the frontend never calls it and updater artifacts are not
generated. Removing or feature-gating the plugin can be a later cleanup if the
extra build complexity is worth it.

## SteamPipe VDF Files

VDF files are SteamPipe build scripts. They describe which staged files are
uploaded to which Steam depots.

They do not contain credentials.

Commit templates with placeholders. Generate local VDF files before upload.

Recommended layout:

```text
steam/
  app_build.vdf.template
  depot_build_windows.vdf.template

_steam/
  windows/
  output/
```

`_steam/` is generated and must stay ignored.

### App Build Template

`steam/app_build.vdf.template`:

```vdf
"AppBuild"
{
  "AppID" "${STEAM_APP_ID}"
  "Desc" "RouteVN Creator ${APP_VERSION} Windows"
  "ContentRoot" "../_steam/windows"
  "BuildOutput" "../_steam/output"
  "Preview" "0"

  "Depots"
  {
    "${STEAM_WINDOWS_DEPOT_ID}" "depot_build_windows.local.vdf"
  }
}
```

### Depot Build Template

`steam/depot_build_windows.vdf.template`:

```vdf
"DepotBuild"
{
  "DepotID" "${STEAM_WINDOWS_DEPOT_ID}"

  "FileMapping"
  {
    "LocalPath" "*"
    "DepotPath" "."
    "Recursive" "1"
  }

  "FileExclusion" "*.pdb"
}
```

The generated local files should be named like:

```text
steam/app_build.local.vdf
steam/depot_build_windows.local.vdf
```

Do not commit those generated files.

## Credentials

Credentials are supplied to SteamCMD, not VDF files.

Use a dedicated Steam build account, not a personal owner account. Give that
account only the permissions needed to upload builds and manage app metadata.

Local first-time login:

```bash
steamcmd +login "$STEAM_USERNAME"
```

SteamCMD will ask for the password and Steam Guard code. After successful
login, SteamCMD writes an auth token into its `config/config.vdf`.

Future local uploads can usually use the saved token:

```bash
steamcmd +login "$STEAM_USERNAME" +run_app_build ../steam/app_build.local.vdf +quit
```

Treat SteamCMD `config/config.vdf` as a secret. It should not be copied into the
repo and should not be printed in logs.

## Local Environment

Use local shell environment variables or a local ignored `.env` file.

Example:

```env
STEAM_APP_ID=000000
STEAM_WINDOWS_DEPOT_ID=000001
STEAM_USERNAME=routevn-build
APP_VERSION=1.6.6
```

Do not commit this file if it contains private Steam metadata or usernames.

## CI Safety

Do not run Steam uploads on pull requests from forks.

If Steam uploads are automated later:

- use manual workflow dispatch or protected release tags
- use GitHub protected environments
- restrict approval to maintainers
- store `STEAM_USERNAME` as a secret if the username should be private
- store SteamCMD `config.vdf` as a protected secret/file or preserve it in a
  locked CI cache
- never expose Steam account passwords to untrusted workflow contexts
- never upload from workflows that run arbitrary contributor code

The safest first implementation is local manual upload from a maintainer
machine.

## Staging Content

SteamPipe should upload the launchable installed payload, not the public
installer artifact.

Windows:

- Build a Steam-specific Windows Tauri release.
- Stage the launchable `.exe` payload into `_steam/windows/`.
- Exclude `.pdb` files.
- Configure Steam launch options to run the staged executable.
- Validate on a clean Windows machine or VM.

macOS:

- Build a Steam-specific signed/notarized `.app` if shipping macOS on Steam.
- Stage the `.app` bundle into the macOS depot content root.
- Configure Steam launch options to run the `.app`.
- Keep direct-download `.dmg` distribution separate from Steam depot content.

Linux:

- Build a Steam-specific Linux artifact if shipping Linux/Steam Deck.
- Prefer the simplest artifact that runs reliably through Steam.
- If using AppImage, verify executable permissions after SteamPipe upload and
  after install through Steam.

## Upload Flow

Expected future local flow for Windows:

```bash
bun run tauri:build:win:steam
./scripts/stage-steam-win.sh
./scripts/render-steam-vdf.sh
steamcmd +login "$STEAM_USERNAME" +run_app_build ../steam/app_build.local.vdf +quit
```

Steam build commands:

```bash
bun run tauri:build:win:steam
bun run tauri:build:mac:steam
bun run tauri:build:linux:steam
```

The flow should remain:

1. Build Steam flavor.
2. Stage clean depot content.
3. Generate local VDF files from templates and env vars.
4. Upload through SteamCMD.
5. Assign the build to a private branch in Steamworks.
6. Install from Steam and smoke test.
7. Promote the build to the intended release branch when ready.

## Validation Checklist

Before uploading:

- Steam build uses Steam setup, not direct-download setup.
- RouteVN updater endpoint is not referenced by the built frontend bundle.
- Tauri updater artifacts are not generated for the Steam build.
- Automatic update checks do not run at startup.
- Manual update UI is hidden or disabled.
- No `steam_appid.txt` exists in the staged depot.
- No Steamworks SDK files exist in the staged depot.
- No `.pdb` files exist in the staged depot unless intentionally uploading
  symbols to a private symbol depot.

After upload:

- Install from a private Steam branch.
- Launch from Steam.
- Confirm app starts without external installer steps.
- Confirm project create/open/save works.
- Confirm media import/export surfaces work.
- Confirm update UI is absent.
- Confirm no updater network request is made.
- Confirm logs do not expose credentials or local paths that should remain
  private.

## When To Add Steamworks SDK

Add Steamworks SDK only for a specific feature.

Common reasons:

- Steam Cloud sync
- Steam Workshop
- achievements or stats
- overlay integration
- rich presence
- explicit ownership checks

If adding SDK integration later:

- keep SDK downloads outside the public repo
- do not commit SDK archives or SDK source/header/lib folders
- do not commit `steam_appid.txt`
- ship only runtime files that Steam permits redistributing with the app
- document the exact runtime files staged into each depot
- add a clean local development setup path for contributors who do not have
  Steamworks access

## References

- Steamworks SteamPipe uploading:
  https://partner.steamgames.com/doc/sdk/uploading
- Steamworks SDK API:
  https://partner.steamgames.com/doc/sdk/api
- Steamworks DRM:
  https://partner.steamgames.com/doc/features/drm
- Steam store release process:
  https://partner.steamgames.com/doc/store/releasing
- Steam application types:
  https://partner.steamgames.com/doc/store/application
- Steam Direct app fee:
  https://partner.steamgames.com/doc/gettingstarted/appfee
- Tauri updater:
  https://v2.tauri.app/plugin/updater/
- Tauri Windows distribution:
  https://v2.tauri.app/distribute/windows-installer/
