# Client updates

Update checks send the installed version, platform, architecture, distribution,
channel, and device metadata. Checks work before account sign-in.
`distribution` identifies the installation source, including Android's
`google-play` and `direct` flavours.
Manual checks show an indeterminate progress dialog after 200 ms and close it
before showing the result. Automatic checks do not show the dialog.

## Device metadata

| Field         | Meaning                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| `deviceId`    | Random 12-character Base58 ID generated through the shared Nano ID helper and saved in the app's local database. |
| `deviceModel` | Native hardware model, such as `Pixel 9` or `iPhone17,1`; `unknown` when unavailable.                            |
| `osVersion`   | Native operating-system version; `unknown` when unavailable.                                                     |

The ID is reused across checks, launches, and app upgrades while local app data
is retained. It identifies an app installation, independently of accounts and
hardware identifiers. Clearing its local data generates a new ID. Restoring a
backup containing the database also restores the ID.

Model and OS version are nonblank strings of at most 256 characters, without
ASCII control characters. These fields do not change the response shape.

## Desktop

```http
GET /system/updates/v1/routevn-creator/tauri?currentVersion=1.15.1&target=windows&arch=x86_64&distribution=direct&channel=stable&bundleType=nsis&device.id=123456789ABC&device.model=Example%20device&device.osVersion=10.0.26100
Host: api1.routevn.com
```

Desktop includes Tauri's installation `bundleType` and device metadata in the
query. The updater endpoint is assembled at check time so the persisted device
ID can be included. Device values are URL-encoded once. Artifact downloads do
not include device metadata.
Development Tauri builds use the localhost mock by default. Production builds
use `api1.routevn.com`.
Restart the Tauri shell after changing updater configuration or native commands;
`watch:tauri` refreshes only the frontend.

An available release returns HTTP 200 with Tauri's flat response:

```json
{
  "version": "1.16.0",
  "notes": "Improved editor performance.",
  "pub_date": "2026-09-18T08:00:00Z",
  "url": "https://downloads.example.com/creator-update.zip",
  "signature": "<signed artifact .sig contents>"
}
```

No compatible newer release returns HTTP 204 with an empty body.
macOS uses `target=macos-universal` and a universal artifact.
Tauri verifies the artifact signature before installation.

## Mobile

```http
POST https://api1.routevn.com/system/rpc
Content-Type: application/json
X-RouteVN-RPC: 1
```

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "system.getClientUpdate",
  "params": {
    "appId": "routevn-creator",
    "currentVersion": "1.15.1",
    "target": "android",
    "arch": "aarch64",
    "distribution": "google-play",
    "channel": "stable",
    "currentBuild": "9",
    "availableBuild": "10",
    "device": {
      "id": "123456789ABC",
      "model": "Pixel 9",
      "osVersion": "16"
    }
  }
}
```

Android's optional `availableBuild` is the exact build offered by Google Play.
iOS sends `target: ios`, `distribution: app-store`, and omits both build fields.
Native shells supply installed-version and device metadata and construct
requests without account credentials or cookies.

RPC results distinguish `updateAvailable`, `noUpdate` (reason `upToDate` or
`noCompatibleRelease`), and `unsupportedClient`. An available result contains
`release: {version, changelog, publishedAt, installation}`.

| Distribution        | Installation                                                                   |
| ------------------- | ------------------------------------------------------------------------------ |
| Desktop direct      | `{type: tauri, url, signature}`; Tauri verifies and installs.                  |
| Android Google Play | `{type: googlePlay, url, build}`; Play controls availability and installation. |
| iOS App Store       | `{type: appStore, url}`; confirmation opens the app's store page.              |

Store responses omit signatures. Android displays API release notes only when
the returned build matches Play's offer; metadata failures do not block a valid
Play update. Direct APK updating is not implemented. Steam and web retain their
existing distribution behavior.

## Mock endpoint

Run `bun run mock:updates` to serve the development updater endpoints at
`http://127.0.0.1:8787`. Use `--scenario no-update`,
`no-compatible-release`, `unavailable`, or `rate-limited` to select a response.
Default desktop fixtures contain placeholder artifacts and cannot install.

Production endpoints must support these request fields before this client ships.
Existing desktop clients discover the first dynamic-update build through their
current static manifest.
