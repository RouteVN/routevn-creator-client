# Client updates

Update checks send the installed version, platform, architecture, distribution,
channel, and device metadata. Checks work before account sign-in.
`distribution` identifies the installation source, including Android's
`google-play` and `direct` flavours.

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
GET /system/updates/v1/routevn-creator/tauri?currentVersion=1.15.1&target=windows&arch=x86_64&distribution=direct&channel=stable
Host: api.routevn.com
X-RouteVN-Device-Id: 123456789ABC
X-RouteVN-Device-Model: Example%20device
X-RouteVN-OS-Version: 10.0.26100
```

Desktop sends device metadata as headers supported by Tauri's updater.
`deviceModel` and `osVersion` are UTF-8 percent-encoded with
`encodeURIComponent`; the server decodes them once. Device headers are excluded
from artifact downloads.

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
POST https://api.routevn.com/system/rpc
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
    "deviceId": "123456789ABC",
    "deviceModel": "Pixel 9",
    "osVersion": "16"
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

Run `bun run mock:updates` to serve the same interfaces at
`http://127.0.0.1:8787`. Use `--scenario no-update`,
`no-compatible-release`, `unavailable`, or `rate-limited` to select a response.
Default desktop fixtures contain placeholder artifacts and cannot install.

Production endpoints must support these request fields before this client ships.
Existing desktop clients discover the first dynamic-update build through their
current static manifest.
