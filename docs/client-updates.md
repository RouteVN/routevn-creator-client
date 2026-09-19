# Client updates

Release checks include the installed version, platform, architecture, distribution,
and channel. `distribution` is the Android flavour: `google-play` or `direct`.
Checks work before account sign-in. Project format versions are unrelated.

## Platform behavior

| Installation                 | Metadata                                                                   | Installation authority                                                               |
| ---------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Direct desktop               | Tauri dynamic GET; 200 release or bodyless 204                             | Tauri verifies the artifact signature and installs after confirmation.               |
| macOS direct                 | Same GET with custom `target=macos-universal`                              | Universal `.app.tar.gz`; preserve both CPU architectures.                            |
| Android Google Play          | Native `system.getClientUpdate` RPC, matched to Play's offered versionCode | Existing flexible Play update flow, including save/idle/foreground gates.            |
| iOS App Store                | Native `system.getClientUpdate` RPC                                        | Confirm release notes, then open Creator's existing App Store page.                  |
| Android direct / Steam / web | No automatic installation through this API                                 | Existing distribution behavior is preserved. Direct APK updating is not implemented. |

Android metadata failures or a missing catalog entry never block a valid Play
update or recovery of a downloaded update. Store availability is determined by
the store, including rollout, account, and region restrictions. The API supplies
release metadata, not a promise that a store will install that release.

## Wire profile

Desktop production endpoint:

```text
https://api.routevn.com/system/updates/v1/routevn-creator/tauri?currentVersion={{current_version}}&target={{target}}&arch={{arch}}&distribution=direct&channel=stable
```

Tauri receives `{version, notes, pub_date, url, signature}` with no RPC wrapper.
The signature is the signed artifact's `.sig` contents. The shipped public keys,
signature verification, strict newer-version check, and Windows passive installer
mode are unchanged. A check has a ten-second timeout; artifact downloads have a
separate ten-minute timeout. Production still requires HTTPS.

Mobile uses native HTTP so packaged webview origins do not require weaker API
CORS rules. The shells supply actual installed version/build and architecture;
webview code cannot choose an arbitrary HTTP destination. Requests have no account
credentials or cookies:

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
    "availableBuild": "10"
  }
}
```

Android `availableBuild` comes from Play, not from an assumed latest release.
iOS uses `target: ios`, `distribution: app-store`, and omits both build fields.
RPC results distinguish `updateAvailable`, `noUpdate` (with `upToDate` or
`noCompatibleRelease` reason), and `unsupportedClient`. Available results contain
`release: {version, changelog, publishedAt, installation}`. Store installation
variants have a fixed product store URL and no Tauri signature; Google Play also
has the matching `build`. Malformed responses and RPC/HTTP failures are errors,
not evidence that the app is current.

## Mock server

Run from this checkout:

```bash
bun run mock:updates
```

The development server listens at `http://127.0.0.1:8787`. The desktop development
configuration already targets it. Restart it with a scenario to exercise failures:

```bash
bun run mock:updates --scenario no-update
bun run mock:updates --scenario no-compatible-release
bun run mock:updates --scenario unavailable
bun run mock:updates --scenario rate-limited
```

Default `available` fixtures advertise version `1.16.0`, Android build `10`,
Windows/Linux x86_64, universal macOS, Android Google Play, and iOS aarch64.
Selection still considers the request's version/build, architecture, distribution,
and channel. The failure scenarios emit 503/429 and `Retry-After: 60`.

Built-in desktop fixtures are **metadata-only**. Their `.invalid` download URL
and placeholder signature cannot install an application. Use **Later** when
previewing their release prompt. A real installation test requires an actual
updater artifact and matching signature under the development signing key.

For custom fixtures, `--catalog /absolute/path/releases.json` accepts an array
in the shape returned by `createMockReleases()` in `scripts/mock-updates.js`.
Use it to reference real signed artifacts served by your development artifact
server. Keep artifacts, private keys, and local catalogs outside Git. This mock
models single update requests; it is not a production RPC server, persistent
release catalog, rate limiter, or batch/notification conformance implementation.
Its wildcard noncredentialed CORS exists only for local test tools.

Example desktop request:

```bash
curl -i 'http://127.0.0.1:8787/system/updates/v1/routevn-creator/tauri?currentVersion=1.15.1&target=windows&arch=x86_64&distribution=direct&channel=stable'
```

For a physical iOS device, bind explicitly with `--host 0.0.0.0` on a trusted
development LAN; the default loopback bind is not reachable from a phone.
Android USB development uses `adb reverse tcp:8787 tcp:8787`.

For Android, build the frontend using the existing [Android workflow](android.md),
then install a Debug shell that explicitly identifies its Google Play flavour:

```bash
cd android/routevn
./gradlew installDebug -ProutevnDistribution=google-play
adb reverse tcp:8787 tcp:8787
```

Debug defaults to `http://127.0.0.1:8787/system/rpc`; override with
`-ProutevnUpdateApiUrl=http://127.0.0.1:OTHER_PORT/system/rpc` when needed.
The default flavour without `routevnDistribution` remains `direct`. The debug
Play-testing flag does not change that distribution claim. Release builds ignore
the debug endpoint property and always use the production HTTPS API.

For iOS, build/install the Debug shell through the existing [iOS workflow](ios.md),
then pass the Mac's `.local` hostname when launching it:

```bash
ROUTEVN_UPDATE_API_URL=http://my-mac.local:8787/system/rpc bun run ios:launch
```

The launcher forwards this environment value to the app on a device or Simulator.
Use the actual hostname, run the mock with `--host 0.0.0.0`, and grant local-network
access on the phone. The existing `NSAllowsLocalNetworking` setting permits local
hostnames; no global ATS exception is added. This environment override is Debug-only
and lasts for that launch; Release always uses the production HTTPS endpoint.

## Release and verification

Deploy the production API before shipping a build that uses these endpoints.
The mock is not deployed by the client and is never a production fallback.
Deliver the first dynamic-update desktop build through the existing
`latestv1.json` feed. Keep that feed and its artifacts available for old clients;
they cannot discover the new URL without an application update. Retain the
production signing key, and publish consistent metadata to both feeds during
migration.

Run `bun run test:updates` for version ordering, live mock HTTP responses, desktop
updater behavior, mobile metadata/dialogs, and setup/restart regressions. Run
`bun run lint` before pushing. These tests do not establish a successful signed
desktop installation, a Google Play rollout, or a real App Store installation.
The native update surfaces are not exposed by the web VT build; targeted DOM
interaction and setup tests cover their UI decisions instead of static VT images.

Release qualification still requires a signed desktop upgrade on each supported
platform, Android native build/device checks with a Play-eligible installation,
and an iOS native build/device check. Metadata mocks do not emulate Play ownership
or manufacture Play update availability.
