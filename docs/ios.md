# iOS Development

RouteVN Creator's iOS app is a native `WKWebView` shell around the web build.
It does not use Tauri mobile, Fastlane, CocoaPods, or the Xcode GUI workflow.

The iOS app lives in `ios/routevn` and loads the iOS frontend bundle built from
`src/setup.ios.js`.

## Current Scope

This is a simple-tools first pass.

Included:

- command-line `xcodebuild`, physical iPhone, and Simulator workflows
- packaged web assets through a custom `routevn://app/...` URL scheme
- live JavaScript development over the Mac's local network, with no native
  rebuild or reinstall for frontend changes
- native bridge for local SQLite, project files, document picking, downloads,
  and local project import/export
- native streamed distribution ZIP export for file URL save targets
- project storage in the local folder chosen during setup
- user-visible downloads and exports under the app's Documents folder

Not included yet:

- Fastlane
- App Store/TestFlight export automation
- production signing profiles
- remote collaboration

## Local Setup

Install:

- Xcode command line tools, or Xcode with command-line tools selected.
- Bun dependencies for this repo.
- `ios-deploy` for USB iPhone install/launch (`brew install ios-deploy`).
- For a physical iPhone: Developer Mode, trust this Mac, and a development
  signing team configured in Xcode. Unlock the phone to launch/debug it.

Useful checks:

```bash
xcodebuild -version
bun run ios:devices
```

## Project Layout

- `src/setup.ios.js`: iOS runtime entrypoint.
- `src/deps/clients/ios/`: low-level iOS client adapters.
- `src/deps/services/ios/`: iOS service adapter composition.
- `static/ios/index.html`: iOS asset HTML template.
- `scripts/build-ios-assets.js`: copies `_site` output into iOS resources.
- `scripts/watch-ios.sh`: prepares and watches the iOS frontend bundle.
- `scripts/ios-dev-server.js`: iOS watch server and live-reload endpoint.
- `scripts/ios-dev.js`: LAN URL configuration and JavaScript refresh command.
- `scripts/ios.sh`: command-line build/install/launch helper.
- `ios/routevn`: native iOS project.

The iOS HTML loads `construct-style-sheets-polyfill` before Rettangoli so
WebKit on iOS 16.0–16.3 can construct and adopt stylesheets. The iOS build and
watch scripts copy the published polyfill into the local `/ios/` assets for
offline startup. It is only loaded by `static/ios/index.html`; other platform
entrypoints do not load it.

Asset uploads use Web Crypto for SHA-256 when available and the bundled
`@noble/hashes` implementation otherwise. The LAN HTTP watch URL does not expose
`crypto.subtle`, so uploads must not require it. Both implementations produce
the same file-record hashes, including hashes for generated waveform metadata.

Packaged builds load local assets through:

```text
routevn://app/ios/index.html
```

Selected-folder project files and temporary picker files are served through:

```text
routevn://app/ios-files/...
```

## Physical iPhone: Build Once

The helper commands target the single connected USB iPhone by default. Use
`--device UDID` or `IOS_DEVICE_UDID` when more than one device is connected.

Build, install, and launch the Debug shell with your development team:

```bash
bun run ios:run -- --team YOUR_TEAM_ID
```

You can also set `IOS_DEVELOPMENT_TEAM` instead of passing `--team`.
This step builds the packaged frontend and native app. Repeat it when Swift,
`Info.plist`, signing, native bridge behavior, or native resources change.
Signing uses the existing Xcode development identity/profile; it is still
required for device installation.

To install an already built shell, use `bun run ios:install`. To launch the
installed shell without building or installing, use `bun run ios:launch`.

## Physical iPhone: Daily Frontend Development

Keep the Mac and iPhone on the same Wi-Fi/local network. USB is used to
configure and launch the app; the frontend is fetched over the local network.

1. Start the watch server and leave it running:

   ```bash
   bun run watch:ios
   ```

2. In another terminal, open the installed shell in dev mode:

   ```bash
   bun run ios:dev
   ```

   Allow Local Network access if iOS asks. This command saves the server URL in
   the app's `Library/routevn-dev.json` and launches the existing app. It does
   not build or install. If the phone is locked, the setting can still be saved;
   unlock the phone and reopen RouteVN Creator.

3. Save JS, YAML view, store, handler, i18n, or setup changes. Rettangoli/Vite
   serves the changes and reloads connected clients. To request a full
   JavaScript reload manually:

   ```bash
   bun run ios:refresh
   ```

   Refresh uses the watch server's WebSocket and does not restart, sign, build,
   or install the native app. Keep the app in the foreground. If no clients
   are connected, the command reports that instead of claiming a refresh.
   Reloading can discard unsaved local form state.

The default port is **3004**. The URL uses the Mac's detected LAN IPv4 address,
for example `http://192.168.1.10:3004/ios/index.html`. To override either:

```bash
IOS_DEV_HOST=my-mac.local IOS_DEV_PORT=4000 bun run watch:ios
```

`ios:dev` reads the running server's URL from the ignored
`.artifacts/ios-dev-server.json`. Run it again if the Mac's address or port
changes. A physical phone cannot reach the Mac using `127.0.0.1`; unlike
Android, this workflow does not use `adb reverse`.

The Debug app remembers dev mode when reopened. Keep the watch server running,
or return to the installed app's bundled assets:

```bash
bun run ios:packaged
```

Release builds always use bundled assets and ignore the development setting.
Native project files stay in the selected folder when switching modes; app
settings stay in Application Support. Origin-specific WebView storage (such as
the remembered route) differs.

If the dev server cannot load, the Debug shell shows the URL and connection
error with **Retry** and **Use Installed App** actions. The latter clears the
saved dev URL and opens bundled assets. Debug-mode startup, navigation failures,
and JavaScript errors are recorded in `Library/Caches/routevn-dev.log` in the
app container. To retrieve that log without attaching a debugger:

```bash
ios-deploy --id DEVICE_UDID --bundle_id com.routevn.creator \
  --download=/Library/Caches/routevn-dev.log --to /tmp/routevn-ios-logs
```

Watch mode prepares the static bundles once at startup. For changes to the
bundle build inputs or static icons, restart `watch:ios`; for a native or
packaged-assets check, stop watch mode before running `ios:run`. Watch modes
share `_site`, so run only one platform's watch process in this checkout.

## App Store Release Build

The Release target supports iPhone and iPad in one archive (`TARGETED_DEVICE_FAMILY
= 1,2`) and requires iOS/iPadOS 16 or newer. It bundles the frontend and compiles
out the development-server configuration and Safari inspection support.

An existing development certificate can build an archive, but App Store export
also needs distribution signing. Automatic export requires the signing team's
Apple Developer Program account in Xcode Settings → Apple Accounts. For manual
export, install an Apple Distribution certificate with its matching private key
and an App Store provisioning profile for `com.routevn.creator` instead.

Stop watch mode before building in this checkout, or build from a separate
source snapshot so the shared `_site` output is not replaced underneath watch:

```bash
bun run build:ios
release_dir=".artifacts/ios-release/1.16.0-6"
mkdir -p "$release_dir"
xcodebuild -project ios/routevn/routevn.xcodeproj -scheme routevn \
  -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' \
  -derivedDataPath "$release_dir/DerivedData" \
  -archivePath "$release_dir/RouteVN-Creator.xcarchive" \
  -allowProvisioningUpdates DEVELOPMENT_TEAM=YOUR_TEAM_ID archive
```

For a local IPA, create an `ExportOptions.plist` with `method=app-store-connect`,
`destination=export`, `signingStyle=automatic`, the matching `teamID`, and
`manageAppVersionAndBuildNumber=false`, then run:

```bash
xcodebuild -exportArchive \
  -archivePath "$release_dir/RouteVN-Creator.xcarchive" \
  -exportPath "$release_dir/export" \
  -exportOptionsPlist "$release_dir/ExportOptions.plist" \
  -allowProvisioningUpdates
```

This saves the IPA locally; uploading and submitting for review are separate
steps. Increment `CURRENT_PROJECT_VERSION` for another upload of the same app
version. Validate the resulting bundle's version, `UIDeviceFamily`, packaged
assets, signature, and privacy manifest before distribution.

For terminal-only manual export, set `signingStyle=manual`, `signingCertificate`
to the installed distribution certificate's SHA-1, and `provisioningProfiles`
to a dictionary mapping `com.routevn.creator` to the installed profile's UUID.
Keep `destination=export` and omit `-allowProvisioningUpdates`; this uses local
signing assets without an Xcode account session. With Xcode 26, install the
profile as `~/Library/Developer/Xcode/UserData/Provisioning Profiles/<UUID>.mobileprovision`.
Check the exported IPA has the expected Apple Distribution signer, an embedded
App Store profile, and `get-task-allow=false` before handing it off for upload.

`PrivacyInfo.xcprivacy` declares file metadata access for app-owned storage
(`C617.1`) and folders/files selected by the user (`3B52.1`), following
[Apple's required-reason API definitions](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitypereasons).

## Simulator And Asset Commands

Build iOS web assets:

```bash
bun run build:ios
```

Build the native app for Simulator:

```bash
bun run ios:build -- --simulator "iPhone 17"
```

Build, install, and launch on the default Simulator:

```bash
bun run ios:run -- --simulator "iPhone 17"
```

To use the running watch server from a Simulator without rebuilding:

```bash
bun run ios:launch -- --simulator "iPhone 17" --dev-server "http://127.0.0.1:3004/ios/index.html"
```

List available Simulators:

```bash
bun run ios:devices -- --simulator "iPhone 17"
```

Run the built-in simulator smoke test:

```bash
bun run ios:run -- --simulator "iPhone 17" --smoke-test
```

## Native Adapters

iOS uses native adapters for routing, SQLite, Files/Photos pickers, project
storage, and exports. They live in `src/deps/clients/ios/` and
`src/deps/services/ios/`, with the bridge in `RouteVNApp.swift`.
Native bridge changes require rebuilding and installing the shell; refreshing
JavaScript alone cannot add them.

### Project Folder Setup And Storage

Startup opens `/project-folder-setup` when no usable library is saved; otherwise
the normal initial route is `/projects`. Config's Change Folder action reopens
setup without loading a project repository. Continue returns to Config when
opened from there, or to Projects on first setup. Bottom navigation must render
without a loaded repository; recent scene details appear only when one exists.
The app shell waits for startup routing before mounting a page, so missing folder
setup never triggers project discovery or a project-loading error. After
`build:ios`, run `node tests/ios/startup.browser.mjs` to check first setup,
reconnection, and configured-folder loading in Chromium and WebKit.

Setup uses the native Files directory picker with the **Open** action. Choosing
`On My iPhone` or `On My iPad` creates `RouteVN Projects` only if absent and
reuses an existing directory without changing its contents. Choosing another
folder uses that folder directly. Selection checks access and saves a bookmark
immediately; there is no separate Confirm button. Cancellation and failed
selection preserve the previous choice. Lost access requests reconnection
without recreating the folder or falling back to internal storage.

`ProjectFolderSetup.swift` accepts the system local Files provider and rejects
app-owned containers and cloud/unknown providers. URLs must come from the picker;
never construct app-group UUIDs. It uses `.minimalBookmark` and
`NSFileCoordinator`, retaining security-scoped access while project databases
or assets may be open. Saved bookmarks retain their original locations, including
legacy parent bookmarks. Permission covers the selected directory and its
contents. Do not implement setup by exporting an empty directory through Save:
Files can replace an existing folder before the delegate callback runs.

New projects use `<library>/<sanitized-project-name>/project.db`, with `files/`
and `file-metadata/` beside the database. Preview and creation share the naming
rule: preserve Unicode/spaces, replace unsafe characters, trim dots/whitespace,
and limit names to 180 UTF-8 bytes. Empty names use `Untitled Project`; collisions
receive ` (2)`, ` (3)`, etc., ignoring case. Preview does not reserve a directory;
creation rechecks under file coordination and never merges into an existing one.

`ProjectStoragePaths.swift` resolves databases and assets only within the chosen
library. `.routevn-project.json` (`version: 1`, `id`) preserves project identity
across folder renames; the database still owns project information. Existing
id-named folders remain supported. Malformed identities and duplicate IDs are
excluded without blocking unrelated projects; ambiguous IDs cannot resolve to
an arbitrary copy. Removing duplicate copies restores discovery. Failure to read
the library itself remains an error.

Old app-private projects are left untouched and are not discovered or migrated.
On iOS, Remove hides a project from the list without deleting its folder;
`iosRemovedProjectIds` preserves that choice across scans and restarts. Explicit
re-import restores the entry. Projects removed before this behavior was added
need to be removed once more.

The native shell supplies the device label independently of viewport size.
Setup, Config, and Projects show readable paths with plain `/` separators.
Projects omit `project.db`, stay on one line, and shorten earlier folders so the
project folder remains visible. Display paths never replace IDs or native paths.
The iOS Projects list keeps its header/footer outside an always-scrollable
container (`overflow-y: scroll`, `overscroll-behavior-y: contain`); native bounce
still needs physical-device validation.

Project metadata reads use `ProjectDatabaseReader` for import, listing, and
export. An exported WAL-mode `project.db` can have no `project.db-wal` after a
checkpoint. On the physical iPhone, a direct read-only metadata query then
failed with `SQLITE_CANTOPEN` while opening the absent WAL. When a direct read
fails with `SQLITE_CANTOPEN` or `SQLITE_READONLY`, the reader coordinates a
private temporary copy of the database and any WAL/rollback journal, then
reads that writable copy. It rebuilds the transient SHM index locally, preserves
committed WAL transactions, and cleans up the copy on success or failure.
Corrupt or missing databases still fail. Normal readable databases keep the
direct read path; import sources are never opened for writing.

Native regression check (disposable filesystem fixtures, including read-only
source folders and uncheckpointed WAL data):

```bash
swiftc -module-cache-path /tmp/routevn-folder-swift-cache ios/routevn/routevn/ProjectDatabaseReader.swift tests/ios/projectDatabaseReaderNative.swift -o /tmp/routevn-project-database-reader-tests
/tmp/routevn-project-database-reader-tests
```

### Export Destination

Web export opens the native Files folder picker. `SaveFileDestinations.swift`
holds the exact security-scoped selection behind a temporary `routevn-save` URI,
builds locally, then publishes under file coordination. Cancellation creates no
download. Collision suffixes preserve existing exports, and staged/partial files
are cleaned on success or failure. Native ZIP streaming and JavaScript fallback
share this path; the result contains the actual saved filename, including any
suffix. Readable success messages do not rename files.

Shared `Documents/RouteVN Creator` and `Exports` folders are created only when a
download/export needs them. Startup creates only private app storage.
See Apple's [directory-access guidance](https://developer.apple.com/documentation/uikit/providing-access-to-directories).

### Audio Playback

The native WebView allows audio playback without a user gesture
(`mediaTypesRequiringUserActionForPlayback = .video`). Fullscreen preview
replaces the editor's audio element after asynchronous preparation; requiring
a gesture rejects that new element's `play()` with `NotAllowedError` on iPad.
This setting requires rebuilding and installing the native shell.

On iOS 16.3, direct Web Audio can be silent under the Ring/Silent switch even
while playback advances. The iOS output adapter routes the gain node through a
`MediaStreamAudioDestinationNode` into an app-owned audio element, following
the [WebKit workaround](https://bugs.webkit.org/show_bug.cgi?id=251532).
Other platforms retain their direct output.

`audioOutput.js` pauses the media element **before** stopping its producer on
pause, stop, natural end, replacement loads, and close; reversing this order can
repeat buffered audio. Final release clears `srcObject`, stops tracks, and
removes the element. Late play/seek completions cannot restart cancelled playback
or replace a newer seek target. Failures leave the UI stopped and show an error.

`graphicsAudioOutput.js` connects the published `configureAudioRuntime` hook to
the same media output. It preserves native context methods and the mobile clock.
Each preview gets a fresh stream and a zero-valued constant source to avoid
stale buffer repetition between sounds. Close the output before destroying
renderer sources. Media playback starts without blocking renderer initialization
on its promise; pending playback must not prevent rendering or closing a preview.

Android and iOS share `mobileAudioRuntime.js`. Audio runs only while both native
activity and document visibility are active. Backgrounding pauses the iOS media
element first, suspends contexts, and freezes the scene clock/timers. Returning
resumes previously playing tracks; explicitly paused, stopped, or closed tracks
stay silent. The iOS delegate also suspends WKWebView media while inactive.
Use packaged mode to test position preservation: a dev connection reconnect can
reload the watch-mode page.

### OGG Decoding

Older iOS rejects OGG in `decodeAudioData`; native support arrived in
[iOS 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/).
Creator's upload waveform extraction and managed audio loaders use
`src/deps/clients/audioDecoder.js`; `route-graphics`' own fallback does not cover
these paths. Native decoding is attempted first on copied bytes because it may
detach its input. On an OGG failure, the identification packet selects the
published Vorbis/Opus decoder even if the picker supplied an unknown MIME type.
Decoders are freed after use; invalid input still fails, and stored uploads keep
their original bytes. Real codec fixtures live in `tests/fixtures/audio/`.

### Scene Editor Keyboard And Navigation

Native app-window metrics select the layout: landscape windows at least 768
logical pixels wide use 60% lines / 40% preview; portrait and narrow windows
remain stacked. `getWindowMetrics` and `routevn:window-metrics` report bounds
independent of keyboard occlusion. Rotate by changing styles, preserving editor
and canvas instances. Visual viewport metrics separately fit the workspace above
the keyboard. See [Scene Editor](engineering.md#scene-editor) for the shared
iOS/Android contract.

`sceneEditorKeyboard.js` requests `focus({ preventScroll: true })` on bubbling
`mousedown`, after text-mode activation and before default tap focus. This keeps
the preview fixed without cancelling native caret placement. Opening a scene
must not focus the editor. Outside focus changes cancel pending caret recovery,
and blur invalidates queued callbacks so dismissal stays dismissed. Preserve
WebKit's native scroll gestures and keyboard observers; disabling them can
prevent the software keyboard from appearing. DOM focus alone does not prove
keyboard visibility.

After keyboard or Up/Down changes, reveal the caret inside the dialogue
scroller. On iOS 16, shadow selection may appear as a zero-sized range on `body`.
Try DOM geometry first, then the native `getCaretRect` fallback using public
[`UITextInput`](https://developer.apple.com/documentation/uikit/uitextinput/selectedtextrange)
and [`caretRect(for:)`](https://developer.apple.com/documentation/uikit/uitextinput/caretrect(for:))
APIs. UIKit already converts the rectangle into WebView coordinates: apply only
the CSS-pixel scale, without adding visual viewport offsets again. Discard replies
after superseding keys, changed focus, later taps, dismissal, or teardown.

Native caret geometry also synchronizes the selected dialogue line when DOM
selection is hidden. Cross a section boundary only when consecutive native
measurements show a vertical arrow stayed on the same visual row at the edge.
Wrapped rows keep native movement. Test Down from Section 1 into line 5 of
Section 2, then Up: it must reach line 4 rather than Section 1.

The dialogue list's trailing spacer covers only the obscured bottom plus the
48px toolbar. Do not add the full keyboard height again after viewport resizing
or panning; that allows the final section to scroll entirely away. At maximum
scroll the final line and section heading remain visible.

Inline canvas navigation requires a matching primary press/release inside the
canvas. Outside releases and cancelled gestures cannot arm the fallback; the
later compatibility click must not advance twice. Non-pointer activation retains
its click path. Preview controls stay above the loading overlay so initialization
and asset loading can be dismissed.

The scene surface reserves `--rvn-mobile-overlay-top-inset` with the page's `bg`
color; action panels and constrained preview height include it. Portrait command
panels use `dvw` to align with the preview: iPad can retain a stale `vw` after
window changes, placing panels over the canvas. Keep the iOS tab bar mounted but
hidden while the keyboard is visible: recreating shadow roots
with the iOS 16 stylesheet polyfill can briefly show oversized, unstyled icons.
See [Lexical pointer selection](notes/lexical-pointer-selection.md) for older
WebKit caret placement, and the [VisualViewport example](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport#examples)
for layout versus visible viewport coordinates.

### iPad Width, Cropping, And Video

iPadOS 26.4 can retain a stale `100vw` width after resume while parent layout and
dynamic viewport units remain correct. iOS app content uses parent-relative
`100%`. Dialog sizing uses the published Rettangoli UI 1.22.1 fix from
[PR #477](https://github.com/yuusoft-org/rettangoli/pull/477), which prefers dynamic
viewport widths and guards calculations with `@supports` for legacy browsers.

The medium crop dialog scales its square surface to available width, up to
400px. Image geometry uses logical crop coordinates, remains clipped, and
preserves the selection/exported area during resizing, drag, and pinch.
Video previews fill and center within their stage with `object-fit: contain`.

Images and Videos offer Photo Library and Choose Files. Photos preserves accepted
formats, converts other images to JPEG/PNG, and converts MOV to MP4 when required.
Temporary sources/conversions are removed after import or failure. Access is
limited to selected items; other file types open Files directly.

iOS can leave detached blob videos at `HAVE_METADATA` despite `preload="auto"`
([WebKit limitation](https://bugs.webkit.org/show_bug.cgi?id=197608)). The iOS
`prepareIOSVideoForThumbnail` hook starts muted inline playback, then pauses
before sampling, with a five-second timeout. Timeout, rejection, and late play
completion all pause the element. Both extraction paths use the hook; other
platforms do not install it. The shell allows inline media, and preview videos
set `playsinline` to avoid a second native fullscreen player. Close controls
respect top/side/bottom safe areas; closing pauses the video before removal.

### Status Bar Theme

The native status-bar foreground follows Config's theme independently of the
system theme. The iOS theme adapter sends `setStatusBarStyle` on saved-theme load
and changes: Dark, Black, and Catppuccin Mocha use light indicators; Light uses
dark indicators. The background remains the page's themed safe area. Changes
apply immediately once the native bridge is installed.

## Validation

The PR workflow runs lint and the web build. Browser and native checks below run
separately. Browser fixtures use isolated storage or disposable generated data;
they do not validate native Files permissions, keyboard animation, or audible
output. Unit checks should exclude ignored worktrees:

```bash
bunx vitest run tests/ios tests/vnPreview tests/sceneEditor tests/audioPlayer tests/resourcePages tests/squareImageCropper tests/web/audioDecoder.test.js --exclude '**/.artifacts/**' --maxWorkers=4
```

With `watch:ios` running, run the relevant browser script with `node`:

| Script | Regression coverage |
| --- | --- |
| `tests/ios/projectFolderSetup.browser.mjs` | Setup, cancellation/errors, Config return, readable paths, Projects clicks/scrolling |
| `tests/ios/projectCreation.browser.mjs` | Destination preview, sanitized names, stable typing |
| `tests/ios/mobileNavigation.browser.mjs` | Menus without a loaded repository, backdrop dismissal |
| `tests/ios/appWidth.browser.mjs` | App and Projects width as containers resize |
| `tests/ios/resourceGridDefaults.browser.mjs` | Phone/tablet defaults and saved grid preferences |
| `tests/ios/sceneCreation.browser.mjs` | Scene forms and canvas long press |
| `tests/ios/sceneCanvasNavigation.browser.mjs` | Canvas/line synchronization and editor focus |
| `tests/ios/sceneEditorNavigation.browser.mjs` | Cross-section navigation with hidden DOM selection |
| `tests/sceneEditor/canvasActivation.browser.mjs` | Valid activation versus cancelled/outside releases |
| `tests/sceneEditor/keyboardDismiss.browser.mjs` | Focus transfer, dismissal, re-entry |
| `tests/sceneEditor/sceneEditorScroll.browser.mjs` | Maximum scroll and portrait/landscape keyboard geometry |
| `tests/sceneEditor/windowLayout.browser.mjs` | Editor/canvas preservation through rotation and split windows |
| `tests/ios/graphicsAudioOutput.browser.mjs` | Real engine output, stop/end silence, lifecycle/cleanup |
| `tests/ios/scenePreview.browser.mjs` | Preview initialization while audio playback is pending |
| `tests/vnPreview/loadingClose.browser.mjs` | Touch dismissal during initialization and asset loading |
| `tests/squareImageCropper/squareImageCropper.browser.mjs` | Resizing, gestures, stable selection, exported pixels |

Native filesystem checks use disposable fixtures on macOS and require access to
the host file coordination service:

```bash
swiftc -module-cache-path /tmp/routevn-folder-swift-cache ios/routevn/routevn/ProjectFolderSetup.swift tests/ios/projectFolderSetupNative.swift -o /tmp/routevn-folder-native-tests
/tmp/routevn-folder-native-tests
swiftc -module-cache-path /tmp/routevn-folder-swift-cache ios/routevn/routevn/ProjectFolderSetup.swift ios/routevn/routevn/ProjectStoragePaths.swift tests/ios/projectStoragePathsNative.swift -o /tmp/routevn-storage-native-tests
/tmp/routevn-storage-native-tests
swiftc -module-cache-path /tmp/routevn-export-swift-cache ios/routevn/routevn/SaveFileDestinations.swift tests/ios/saveFileDestinationsNative.swift -o /tmp/routevn-save-destinations-tests
/tmp/routevn-save-destinations-tests
```

Use a physical device for these final checks:

- Select/reconnect a library, cancel a replacement selection, create a project,
  restart, and rename its folder in Files. Removing the list entry must persist
  without deleting files; explicit re-import restores it.
- Export into a chosen folder, cancel, and repeat an export with the same name.
  Existing files must survive and the reported ZIP must open.
- Play, seek, stop, switch tracks, close previews, and background/resume with the
  Ring/Silent switch both on and off. Verify MP3 and both OGG fixture codecs.
- Upload a gallery video; processing must finish without native fullscreen.
  Close a loading preview, drag/pinch the cropper, and verify its exported crop.
- Open/type/dismiss the software keyboard, move across sections, and scroll to
  both ends. The preview stays at the safe-area top and the caret stays visible.
- Rotate/resize the iPad and background/resume; content fills its container,
  menus remain usable, and editor/canvas instances survive. Check theme changes
  and restart with readable status-bar indicators.

Physical XCTest with Xcode 26.6 and the iOS 16 test phone returned `Logic Testing
Unavailable` despite successful build/signing. Use Safari Inspector plus device
screenshots and actual interaction for keyboard validation; focused DOM state
and browser passes alone do not establish that the native keyboard appeared.
