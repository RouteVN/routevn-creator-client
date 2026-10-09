# Client updates

Update checks send the installed version, platform, architecture, distribution,
channel, and device metadata. Checks work before account sign-in.
`distribution` identifies the installation source, including Android's
`google-play` and `direct` flavours.
Manual checks show an indeterminate progress dialog after 200 ms and close it
before showing the result. Automatic checks do not show the dialog.
A manual check started while an automatic check is in flight joins it and is
reported with that check's trigger, so only one request is sent.
Automatic checks stay silent unless an update is available. Manual check failures,
including unsupported clients and no compatible release, show the same error:
“Could not retrieve update information.” A successful up-to-date result still
shows the latest-version confirmation for manual checks.

## Device metadata

| Field         | Meaning                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| `deviceId`    | Random 24-character Base58 ID generated through the shared Nano ID helper and saved in the app's local database. |
| `deviceModel` | Native hardware model, such as `Pixel 9` or `iPhone17,1`; `unknown` when unavailable.                            |
| `osVersion`   | Native operating-system version; `unknown` when unavailable.                                                     |

The ID is reused across checks, launches, and app upgrades while local app data
is retained. It identifies an app installation, independently of accounts and
hardware identifiers. Clearing its local data generates a new ID. Restoring a
backup containing the database also restores the ID.
IDs are 24 Base58 characters; the update API rejects any other length.

Model and OS version are nonblank strings of at most 256 characters, without
ASCII control characters. These fields do not change the response shape.

## Usage fields

Every check also reports how and where it ran: `uiLanguage`,
`uiLanguageSource`, and `trigger` beside the request fields, and
`formFactor`, `language`, and `webViewVersion` inside `device` (query names
`uiLanguage`, `uiLanguageSource`, `trigger`, `device.formFactor`,
`device.language`, `device.webViewVersion` on desktop).

The API rejects the whole check when an optional field is present but invalid
("a present but invalid optional value fails the check; absent stays absent"),
so each value is validated immediately before it is sent and omitted when it
fails or cannot be read; reading a value never fails the check. Shared
JavaScript validates the mobile RPC path, and Rust revalidates everything as
it appends the desktop query parameters. `src/internal/updateUsage.js` holds
the shared rules and one language normalizer; the same algorithm and test
table live in `src-tauri/src/update_device_info.rs`.

| Field               | Source                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `device.formFactor` | Native shell: iOS `desktop` on Mac (`isiOSAppOnMac` wins over the pad idiom), else `tablet` for the pad idiom and `phone` otherwise; Android `desktop` on ChromeOS, else the sw600dp display boundary; desktop builds always `desktop`. |
| `device.language`   | First preferred device language, read natively (`Locale.preferredLanguages`, system `Configuration` locales, `sys-locale`), normalized to lowercase with no region; only Chinese keeps a script (`zh-hans`/`zh-hant`). Unreadable values send `unknown`, which the API accepts only here. |
| `device.webViewVersion` | Android Chromium major from `WebView.getCurrentWebViewPackage()` (user-agent `Chrome/<major>` before API 26); Windows WebView2 major and Linux WebKitGTK `major.minor` from `tauri::webview_version()`. iOS and macOS omit it. |
| `uiLanguage`        | The app's active locale at check time (`APP_LOCALE_OPTIONS` in `src/internal/ui/appLocale.js`), reread on every check.                |
| `uiLanguageSource`  | `selected` when the stored `app.locale` config is still an offered locale; `default` otherwise. Never inferred from the current locale alone. |
| `trigger`           | `launch` for the forced first automatic check, `periodic` for the ten-minute timer past the two-hour threshold, `manual` for the user's own check. |

The API derives country/region itself; clients never send it.

## Desktop

```http
GET /system/updates/v1/routevn-creator/tauri?currentVersion=1.15.1&target=windows&arch=x86_64&distribution=direct&channel=stable&bundleType=nsis&device.id=123456789ABC123456789ABC&device.model=Example%20device&device.osVersion=10.0.26100&device.formFactor=desktop&device.language=en&device.webViewVersion=128&uiLanguage=en&uiLanguageSource=default&trigger=launch
Host: api1.routevn.com
```

Desktop includes Tauri's installation `bundleType`, device metadata, and the
usage fields in the query. The updater endpoint is assembled at check time so
the persisted device ID and the per-check usage fields can be included. Device
and usage values are percent-encoded once, with spaces as `%20`: the API keeps
a `+` literally, so form encoding would store `macOS 27.0` as `macOS+27.0`.
Artifact downloads do not include device metadata.
Development Tauri builds use the localhost API by default. Production builds
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
POST https://api1.routevn.com/system/updates/v1/routevn-creator/mobile
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
    "uiLanguage": "ja",
    "uiLanguageSource": "default",
    "trigger": "launch",
    "device": {
      "id": "123456789ABC123456789ABC",
      "model": "Pixel 9",
      "osVersion": "16",
      "formFactor": "phone",
      "language": "ja",
      "webViewVersion": "128"
    }
  }
}
```

Android sends its installed `currentBuild`; the API selects the newest eligible
catalog build. The client does not query Google Play or send `availableBuild`.
iOS sends `target: ios`, `distribution: app-store`, and omits build fields.
Native shells supply installed-version and device facts. Shared JavaScript builds
and validates the RPC request and result. WebView `fetch` sends a bounded request
without credentials; the dedicated mobile endpoint must allow anonymous CORS
from packaged Android and iOS origins. On confirmation, each platform opens the
validated store URL returned by the API.
Mobile development checks default to
`http://127.0.0.1:8787/system/updates/v1/routevn-creator/mobile`;
production checks use
`https://api1.routevn.com/system/updates/v1/routevn-creator/mobile`. Reverse TCP 8787
with `adb reverse` for a connected Android device. A physical iPhone needs a
reachable LAN URL through `ROUTEVN_UPDATE_API_URL` when launching the debug app.

RPC results distinguish `updateAvailable`, `noUpdate` (reason `upToDate` or
`noCompatibleRelease`), and `unsupportedClient`. An available result contains
`release: {version, changelog, publishedAt, installation}`.

| Distribution        | Installation                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Desktop direct      | `{type: tauri, url, signature}`; Tauri verifies and installs.                                                               |
| Android Google Play | `{type: googlePlay, url, build}`; the API controls the offer, and confirmation opens the Play Store URL.                    |
| Android direct      | `{type: download, url, build}`; confirmation opens the RouteVN download page (`routevn.com` or a subdomain) in the browser. |
| iOS App Store       | `{type: appStore, url}`; confirmation opens the app's store page.                                                           |

Store responses omit signatures. The RouteVN API is the source of truth for
update availability, version, and release notes on both mobile platforms. API
failures do not produce an update offer or an up-to-date claim. There are no
native Google Play update checks or in-app installation flows, and a direct APK
is installed by the user from the download page. The API must serve Android
direct before a direct build with this updater ships; until then it answers
`unsupportedClient`, and a manual check reports that update information could
not be retrieved. Steam and web retain their existing behavior.

## Development and tests

Run the RouteVN API locally at `http://127.0.0.1:8787` to test development
update checks against its release catalog. API setup and catalog configuration
live in the `routevn-api-2` repository.

Run `bun run test:updates` for client updater regression tests in `tests/updates`.

Production endpoints must support these request fields before this client ships.
Existing desktop clients discover the first dynamic-update build through their
current static manifest.
