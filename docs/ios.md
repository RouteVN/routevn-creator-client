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

### Web Export Destination

Export Web opens the native Files folder picker before building the ZIP. The
selected folder is held as a security-scoped URL behind a temporary
`routevn-save://selected/...` token; cancelling returns no destination and does
not create a download. This implements the existing save-file-picker contract
used by Web export.

`SaveFileDestinations.swift` builds the output in temporary app storage, then
publishes the complete file into the chosen folder with `NSFileCoordinator`.
It keeps the exact URL granted by Files, balances security-scope access, and
cleans staged and partial files after success or failure. A name collision adds
` (2)`, ` (3)`, etc., preserving previous exports. Both native ZIP streaming and
the JavaScript fallback use the same destination. The success message receives
the actual saved file URL, including any numbered suffix. The UI formats it
through `appService.getFileDisplayPath` as a readable Files location such as
`On My iPhone / Exports / Project One_Version 1.zip`, without internal container
IDs or URL encoding. Export filenames use the same shared application-name and
version-name rule as desktop; display formatting never renames the saved file.

The native flow follows Apple's
[directory-access guidance](https://developer.apple.com/documentation/uikit/providing-access-to-directories).
Rebuild and install the shell once for this change; frontend refresh alone does
not replace the previous automatic Downloads destination.

```bash
bunx vitest run tests/ios/filePicker.test.js tests/versions/versions.handlers.test.js
swiftc -module-cache-path /tmp/routevn-export-swift-cache ios/routevn/routevn/SaveFileDestinations.swift tests/ios/saveFileDestinationsNative.swift -o /tmp/routevn-save-destinations-tests
/tmp/routevn-save-destinations-tests
```

Device checks: cancel the picker; choose an On My iPhone folder and export; open
the ZIP in Files; repeat the same export and verify both files remain. The native
test covers publication, collision naming, failed-build cleanup, fallback retry,
expired destinations, and invalid filenames. It requires access to the host's
file coordination service when run on macOS.

### Project Folder Setup And Storage

iOS Config shows the confirmed projects folder below Language. Change folder
reopens the same setup page; opening it or cancelling Files preserves the current
folder. Only Confirm changes the saved location, and Config reads the latest
location each time it opens. Other platforms do not show this section.
Continue sits below Change folder. When setup is opened from Config, Continue
returns to that previous page with its project context; first-time setup goes
to Projects. iOS Config does not load a project repository, so it stays accessible
even when the newly selected library does not contain the previous project.
The bottom navigation menus must also mount without a repository. Previously,
the mobile sidebar subscribed to project state unconditionally during mounting;
opening any bottom tab from iOS Config threw before rendering and left an empty
sheet. It now subscribes only when the selected project is already loaded.
Static navigation stays available, while recent scene details appear when a
project repository is present.
With `watch:ios` running, `node tests/ios/mobileNavigation.browser.mjs` checks
all four menus, backdrop dismissal, and returning to a project in Chromium and
WebKit at iPad portrait, iPad landscape, and phone sizes.
The setup and Config paths use plain slashes, for example
`On My iPhone/My Projects`, with no extra spaces around `/`.
The native shell reports `iPhone` or `iPad` from `UIDevice.userInterfaceIdiom`.
Setup instructions, folder errors, Config, project locations, creation previews,
and export paths use that device name; window width and orientation do not change it.
The older development-shell fallback remains `iPhone`, so rebuild the shell to
validate iPad labels. The label is presentation only and never changes a bookmark
or filesystem path.

The Projects list uses `overflow-y: scroll` and `overscroll-behavior-y: contain`
on iOS, including when its contents fit. It does not use Rettangoli's `sv` flag
there, because that flag forces `overflow-y: auto`. Other platforms retain `sv`.
The header, app-version footer, and outer app frame remain outside the scroller.
Check native bounce with an empty, short, and long project list on the device;
browser layout tests cannot reproduce UIKit's rubber-band animation.

iOS now opens `/project-folder-setup` until a local folder is confirmed. Setup
opens the native Files directory picker. Selecting `On My iPhone` previews a
`RouteVN Projects` folder beneath it. Selecting any folder uses that folder
directly, without adding another `RouteVN Projects` level. Previously saved
bookmarks retain their recorded location; this does not move existing projects.
Only Confirm creates the directory, checks reading and writing, and saves a
bookmark in Application Support (`RouteVNCreator/project-folder-setup.json`).
Cancellation leaves the previous choice intact. Startup restores the bookmark;
if access is lost or the folder disappears, setup requests reconnection without
creating a replacement directory.

New projects are stored in the confirmed library as
`<selected-library>/<sanitized-project-name>/project.db`, with `files/` and
`file-metadata/` alongside the database. The creation dialog shows the readable
destination below the name and updates it as the name changes. Native preview
and creation share the same naming rule: preserve Unicode and spaces, replace
unsafe filename characters, remove leading/trailing dots and whitespace, and
limit the name to 180 UTF-8 bytes. Empty sanitized names use `Untitled Project`;
existing names receive ` (2)`, ` (3)`, etc., compared without case sensitivity.
Preview does not create or reserve directories; creation rechecks availability
under file coordination and never merges into an existing folder.

The project id remains independent of the folder name. A local
`.routevn-project.json` identity file (`version: 1`, `id`) lets the native resolver
find named folders after restart or a Files rename, including partially created
projects. This is native folder metadata; the project's database still owns its
name and other project information. Existing folders named by id within the
selected library keep their original locations. Imported folders retain their existing
id-based destination behavior and record their identity for subsequent lookup.
`ProjectStoragePaths` resolves both SQLite and asset
operations through the saved folder. `ProjectFolderSetup` retains restored
security-scoped access while database handles or asset streams may still use it.
A missing or inaccessible library fails instead of creating an internal fallback.

Projects are discovered and resolved only in the selected library. Old app-private
project folders are not scanned, opened, or reused as import destinations, even
when they contain the same project id. Their files are left untouched. The native
listing replaces cached project entries; a failed listing surfaces an error
instead of showing cached internal projects. App settings, picker temporary
files, and export destinations keep their existing behavior. The iOS Projects
page derives a readable folder path from each database's actual native location,
such as `On My iPhone / RouteVN Projects / Project One`, omitting `project.db`.
Paths occupy one line and shorten the earlier folders with an ellipsis, keeping
the final project folder visible. The absolute database path remains available in
the service data; the display field does not change the project's id or routing key.

Setup accepts the system local Files provider (`On My iPhone`) and rejects
app-owned containers and cloud/unknown providers. Provider URLs must come from
the picker; app-group UUIDs are never constructed. Confirm and restored access
use `NSFileCoordinator`; bookmarks use the iOS-compatible `.minimalBookmark`
option. Real device permission behavior, especially selecting the root of
On My iPhone, still needs physical testing.

The three setup bridge methods require an updated native shell. A live
frontend refresh alone cannot add them. An older shell displays an update
message before allowing another picker attempt.

Focused checks:

```bash
bunx vitest run tests/ios/projectFolderSetup.test.js
# With watch:ios running; isolated browser storage and native-dialog fixtures:
node tests/ios/projectFolderSetup.browser.mjs
node tests/ios/projectCreation.browser.mjs
# Disposable native filesystem/bookmark integration on macOS:
swiftc -module-cache-path /tmp/routevn-folder-swift-cache ios/routevn/routevn/ProjectFolderSetup.swift tests/ios/projectFolderSetupNative.swift -o /tmp/routevn-folder-native-tests
/tmp/routevn-folder-native-tests
# Named folder previews/collisions, SQLite + assets, restart, and selected-folder-only routing:
swiftc -module-cache-path /tmp/routevn-folder-swift-cache ios/routevn/routevn/ProjectFolderSetup.swift ios/routevn/routevn/ProjectStoragePaths.swift tests/ios/projectStoragePathsNative.swift -o /tmp/routevn-storage-native-tests
/tmp/routevn-storage-native-tests
```

The browser check covers the real mobile page, picker callbacks, cancellation,
explicit confirmation, errors, saved-path display, reload and Continue. The
native Files dialog is outside web VT and must be tested on the connected phone.

Storage integration was validated on the physical iPhone 13 Pro (iOS 16.3.1):
a new project was created in the selected local `RouteVN Projects` folder,
its database and copied font were read successfully, and both remained readable
after reinstalling and relaunching the shell. Internal-project compatibility
from that earlier validation has since been removed.

### Audio Playback And Silent Mode

Sound previews use the shared Web Audio player. On iOS,
`src/deps/clients/ios/audioOutput.js` routes the player's gain node through a
`MediaStreamAudioDestinationNode` into an app-owned audio element. Other
platforms keep their existing direct `AudioContext.destination` output.

WebKit treats direct Web Audio output as ambient sound on iOS 16.3, so it can
advance silently even when the audio buffer and gain are correct. Its
[WebKit report](https://bugs.webkit.org/show_bug.cgi?id=251532) recommends the
media-stream output path for this version; the newer `navigator.audioSession`
API is unavailable on the connected iOS 16.3.1 phone.

Physical inspection found a running context, decoded stereo audio with peak
amplitude 0.893 and RMS 0.124, player gain 1, and Speaker output at volume 0.9.
Setting the native app's audio category to Playback did not make that sound
audible, even after rebuilding/reinstalling and confirming the category while
playing. That ineffective native change was removed. The user confirmed that
routing the same sound through the media element made it audible.

The first live diagnostic left the media element running when the Web Audio
source stopped; the user heard repeated buffered audio. The permanent output
adapter pauses the element **before** stopping the source, including pause,
stop, natural end, replacement loads, and closing the player. Final release
also clears `srcObject`, stops the stream tracks, and removes the element.
Late playback completions cannot restart cancelled playback. Output failures
keep the UI stopped and display a localized error.

The lifecycle cases are covered by `tests/ios/audioOutput.test.js`. On-device
checks should cover play, pause/resume, seek, natural end, switching tracks,
closing/reopening the player, and navigating away, with the Ring/Silent switch
both on and off.

Scene-editor and full-screen preview audio use the same iOS media output via
`src/deps/clients/ios/graphicsAudioOutput.js`. It supplies a context adapter to
the published `configureAudioRuntime` hook: native methods and the mobile
clock are preserved, while the engine's destination is the media stream.
The native context and dependency code remain unchanged.

The graphics service requests playback before creating the renderer without
awaiting the media playback promise. Pending playback must not block the canvas,
asset loading, or preview teardown. Playback failures show a localized toast.
Full-screen preview shows its loading status from mount through its first render;
initialization failures show an error and close the unusable preview.
The service closes the output before destroying the renderer's audio sources.
Each new preview gets a fresh stream; background activity uses the same pause/resume subscription as
the Sounds player. A zero-valued constant source keeps the stream producing
silent frames between sounds and after one-shot playback ends, avoiding stale
buffer repetition. It is released with the preview. Existing editor mute and
engine channel controls continue to govern the audio signal.

`tests/ios/graphicsAudioOutput.test.js` covers output lifetime, backgrounding,
initialization failure and late playback completion. The service tests cover
output ordering relative to renderer creation/destruction. With `watch:ios`
running, `node tests/ios/graphicsAudioOutput.browser.mjs` exercises the published
engine and real Web Audio using a generated tone, verifies a nonzero stream
while playing and zero output after stop/natural end, and checks backgrounding,
cleanup and reopening. It uses no project database or user files.

`node tests/ios/scenePreview.browser.mjs` runs the mobile scene-map and editor
preview workflow with isolated web storage and the real iOS audio adapter. It
holds the playback promise pending and delays graphics initialization to verify
that loading appears immediately, rendering completes, and rotate/exit still work.

Android and iOS share `src/deps/clients/mobileAudioRuntime.js`. Native activity
and document visibility must both be active before audio can run. Backgrounding
pauses the iOS media element first, suspends the audio contexts, and freezes the
scene audio clock and timers. Foregrounding resumes previously playing audio
from its saved position; tracks explicitly paused, stopped, or closed stay
silent. The iOS app delegate also suspends all WKWebView media while inactive,
blocking late playback requests even if JavaScript has already been suspended.
The Android lifecycle tests and iOS output tests cover these transitions.

Validated on the connected iPhone 13 Pro running iOS 16.3.1: a real app switch
paused the media output and held the position at 17.597 seconds throughout the
background interval; the packaged app resumed from that position. Three
play/stop cycles and natural playback end each left the output paused. The
watch-mode page reloaded when its development connection resumed, so packaged
mode was used to verify position preservation without that reload.

### Scene Editor Keyboard Position

Wide landscape app windows (width >= 768 points and width > height) place lines
on the left and the preview on the right, at 60% / 40%. Portrait and narrow
multitasking windows keep the stacked layout. `RouteVNViewController` reports
its full view bounds through `getWindowMetrics` and `routevn:window-metrics`
events on layout changes. The keyboard does not resize these native bounds;
its visual viewport metrics only control the available editor height. This
native bridge addition requires rebuilding and installing the shell once.
See the Scene Editor section in `docs/engineering.md` for the shared iOS/Android
contract and browser regression commands.

On the connected iPad mini in a 1133 × 744 point window, the installed shell
reported the same window dimensions with the keyboard open and closed. The
landscape workspace changed from 236px to 623px high, retaining 60% / 40%
columns in both states. The native builds compile for iOS and Android; the
browser rotation and keyboard-scroll fixtures pass in Chromium and WebKit.
Physical Android validation is pending a connected device. The iPhone shell
installed, but its launch check did not succeed, so physical iPhone validation
is also pending.

The editor previously restored an old programmatic caret target whenever focus
fell back to `body`, even after its recovery window expired. An outside tap
could therefore dismiss the keyboard briefly and immediately reopen it. The
shared Lexical primitive now cancels pending recovery on outside pointer input
and explicit focus transfers, and only recovers incidental body blur during
the existing short caret-placement window. A completed blur also invalidates
queued callbacks. This preserves normal typing and caret recovery while letting
keyboard dismissal remain dismissed.

With `watch:ios` running, `node tests/sceneEditor/keyboardDismiss.browser.mjs`
checks mouse/touch dismissal, rapid focus transfer, re-entry, and a native-style
blur without a DOM pointer event in Chromium and WebKit. Its dismissal surface
explicitly blurs the editor because mobile WebKit does not blur every inert-div
tap. The fixture uses isolated editor content and does not access user projects.
After refreshing the physical iPad, native focus opened the keyboard with a
316px visual viewport. Blurring the editor restored the viewport to 744px;
the editor stayed unfocused in block mode with no recovery target through the
follow-up check. The 185 related caret, line-editing, newline, and iOS keyboard
tests pass, along with the Chromium/WebKit dismissal and rotation fixtures.

iOS can pan the whole WebView when a tap focuses a lower dialogue line. The
scene editor's programmatic focus paths already use `preventScroll`, but the
normal text-tap path previously left focus to WebKit's default action.

Safari Web Inspector measurements on the physical iPhone 13 Pro, iOS 16.3.1,
reproduced this with ordinary `editor.focus()` and a caret on the last line:

| Measurement                                   | Before focus | Keyboard revealed | After page correction |
| --------------------------------------------- | ------------ | ----------------- | --------------------- |
| Time                                          | 0 ms         | 77 ms             | 124 ms                |
| Window scroll Y                               | 0            | 161               | 161                   |
| Visual viewport height                        | 844          | 464               | 464                   |
| Rendered canvas top (`getBoundingClientRect`) | 0            | -161              | 0                     |

The same focus/selection sequence with `focus({ preventScroll: true })` kept
window scroll Y and the rendered canvas top at zero throughout the recording,
while the viewport height changed to 464. Physical screenshots confirmed the
software keyboard could open through Web Inspector. Measure the actual canvas
returned by `previewCanvasHost.getCanvasRoot()`; the component host uses
`display: contents` and reports a zero-sized rectangle.

`src/deps/clients/ios/sceneEditorKeyboard.js`, installed only by `setup.ios.js`,
requests focus with `preventScroll` during the bubbling `mousedown` event.
This runs after the primitive's block/text-mode activation and before default
tap focus, without cancelling native caret placement. Once the keyboard changes
the viewport and toolbar spacing is rendered, it reveals the caret inside the
existing dialogue scroller. Gutter clicks, handled reference clicks, context
menus, and other inputs retain their existing handlers.

On iOS 16, the scene editor's shadow selection can be reported as a zero-sized
range on `body`, even while a native caret is visible and the toolbar arrows
move it. The normal JavaScript reveal path then has no caret geometry. The iOS
keyboard adapter now also schedules a reveal after Up/Down keydown, covering
toolbar arrows and hardware keys. It waits for native selection movement, tries
the DOM path first, then requests `getCaretRect` when that path cannot reveal a
selection.

The native bridge finds the first responder inside the WebView through public
`UIView`/`UITextInput` APIs and reads `selectedTextRange` and `caretRect(for:)`.
It converts the rectangle into WebView coordinates without changing selection
or scrolling the native root. The iOS adapter scales those coordinates into
CSS pixels and calls the primitive's `revealSelectionRect`, which
scrolls only the nearest dialogue scroller. Keyboard and toolbar spacing use the
same calculation as the existing DOM caret path. Rapid keys coalesce; replies
for an old key, a later tap, lost focus, keyboard dismissal, or teardown are
discarded. Android and desktop do not install this native fallback.

The mobile dialogue list's trailing spacer must cover only the obscured bottom
of the layout viewport plus the 48px toolbar. Previously it added the full
keyboard height and another 90% of the visible viewport (at least 260px). At
maximum scroll this pushed every line and even the final sticky section header
above the list, leaving an empty editor. Use the keyboard state's `bottom`, not
`keyboardInset`: the latter includes height already removed by viewport resizing
or panning. With the keyboard closed, only toolbar clearance is needed; the
existing section margin and list padding supply breathing room. Desktop keeps
its existing spacing.

With `watch:ios` running, check the actual page/store layout at maximum scroll:

```bash
node tests/sceneEditor/sceneEditorScroll.browser.mjs
```

This reproduces the old blank viewport and checks Chromium and WebKit with
hidden, overlay, panned, and resized keyboards. The final line and section
heading must remain visible, the last line must clear the toolbar, and the
preview and root scroll must remain fixed.

The same hidden selection caused cross-section arrow navigation to use a stale
line id. Physical reproduction moved from Section 1 into line 5 of Section 2,
while the selected line stayed at Section 2's first line and Lexical lost its
selection. Up then incorrectly crossed back to Section 1. Immediate boundary
navigation now requires a readable live selection rather than a cached line id.
The iOS adapter maps UIKit's caret rectangle to the current dialogue line and
updates selection bookkeeping without moving the caret. It crosses a section
only when consecutive native measurements show a vertical arrow stayed on the
same visual row at that section's edge. Line-relative coordinates preserve this
check while scrolling, and superseded keys, changed focus, taps, and keyboard
dismissal invalidate pending measurements. Wrapped rows retain native movement.
The shared DOM-selection path also recognizes movement already synchronized by
Lexical before its next animation frame, so arriving at an edge line does not
trigger another step into the adjacent section.

After the fix, the connected iPhone passed the original sequence: one Down from
Section 1's last line entered Section 2, four more Downs reached line 5, and one
Up reached line 4. UIKit's caret and the selected line agreed after every step,
even though the JavaScript selection remained unavailable.

With `watch:ios` running, exercise the real primitives and toolbar handlers with
Chromium's normal/hidden shadow-selection paths and WebKit's light-DOM selection:

```bash
node tests/ios/sceneEditorNavigation.browser.mjs
```

Inline preview taps synchronize the selected editor line on primary pointer
release, matching the renderer's activation event. Waiting for a browser `click`
can miss iOS advancement when that compatibility event is delayed or absent.
The later click must not arm another selection update. Non-pointer activation
and browsers without Pointer Events retain their click path. The existing
runtime guard still accepts only the expected next line and scrolls it into view.
Check touch and mouse activation against the real renderer and editor in
Chromium and WebKit with `node tests/ios/sceneCanvasNavigation.browser.mjs`.

Physical iPhone inspection confirmed the DOM range was hidden while UIKit
returned the actual caret rectangle (2px wide and 21px high). The native bridge
built and was installed on the connected phone. Browser validation with the real
toolbar handler, native selection movement, and simulated legacy selection APIs
reproduced the old failure: the caret reached y=480 behind the toolbar. With the
fallback, twelve Down and twelve Up actions kept it between the preview and
toolbar, with root scroll zero and the preview top fixed at 47px. Normal DOM
selection APIs passed the same sequence without native bridge requests.

The first native fallback incorrectly added `visualViewport.offsetTop` and
`offsetLeft` to the converted UIKit rectangle. Physical inspection reproduced
the resulting jump with a 380px keyboard pan: the native caret was at y=-25,
but the adapter treated it as y=355 and scrolled the list farther down, from
430px to 454px. UIKit's conversion into the WebView already includes that pan;
adding it again makes an offscreen caret appear visible to the scroll helper.
Keep only the CSS-pixel scale when converting the native rectangle.

After this correction, physical iPhone validation through the persistent Safari
Inspector connection exercised the real toolbar pointer handlers with synthetic
pointer events and read UIKit's caret after every movement. Twelve Down and
twelve Up actions passed both at viewport offset 0 and after explicitly panning
the WebView to 380px to reproduce the failing layout. In the panned layout,
Down scrolled the dialogue list in 24px line increments (2px to 218px), keeping
the caret at y=331; Up returned to scroll zero with the caret at y=309. Every
caret remained between the section header and keyboard toolbar, and the preview
top remained 47px. The native keyboard stayed visible in the device screenshot.
Browser validation also covers this resized, panned viewport and the ordinary
DOM-selection path. Regression tests use the measured negative native caret
position and a scaled/panned viewport; both failed with the extra offset and
passed after its removal.

The fallback and cancellation cases live in
`tests/ios/sceneEditorKeyboard.test.js`; caret clipping above the keyboard and
below the preview is covered by `tests/sceneEditor/lexicalCaretReveal.test.js`.
Apple documents the native read-only geometry APIs in
[`selectedTextRange`](https://developer.apple.com/documentation/uikit/uitextinput/selectedtextrange)
and [`caretRect(for:)`](<https://developer.apple.com/documentation/uikit/uitextinput/caretrect(for:)>).

WebKit documents the iOS `preventScroll` fix in
[Safari 15.5](https://webkit.org/blog/12669/new-webkit-features-in-safari-15-5/).
The app's iOS deployment target is newer than that release.

The controlled device comparison and an inspector event sequence through the
installed adapter kept the canvas top at zero. The user also confirmed the
keyboard transition works with a normal tap. Keep the phone unlocked with
RouteVN foregrounded while recording; a focused DOM element alone does not prove
that the software keyboard is visible.

Keyboard dismissal exposed a separate tab-bar flash: the four 22px navigation
icons briefly measured 390 × 390px, including one animation frame. The app was
unmounting the tabs while the keyboard was open, then recreating them on blur.
On iOS 16.3.1 the adopted-stylesheet polyfill applies new shadow-root styles on a
later animation frame, allowing the unstyled SVGs to fill the viewport first.
The iOS scene editor now keeps the tab bar mounted with inline `display: none`
while the keyboard is visible. This preserves the adopted styles and removes
the tabs from layout, hit testing, and accessibility until they return. Android
and desktop keep their existing mounting behavior. Dependencies are unchanged.
Five hide/show cycles using the real app view and the same polyfill in a browser
fixture preserved the icon nodes and kept their maximum size at 22px. After
reloading the physical iPhone through Safari Inspector, repeating keyboard
dismissal no longer produced oversized icons in the frame/mutation recording.

The fixed scene surface also reserves
`var(--rvn-mobile-overlay-top-inset, 0px)` above the preview, using its existing
`bgc=bg` background for the status-bar area. The iOS HTML supplies the safe-area
value; other platforms use zero. Both the actions-panel position and the
keyboard-constrained preview height include this inset. Browser layout checks
cover zero and 47px insets, viewport panning, keyboard dismissal, and a viewport
small enough to constrain the preview.
Physical iPhone measurements and a screenshot confirmed the preview starts at
47px, the status-bar area matches the page background, and the canvas remains
at 47px when the keyboard opens. A stale dev page initially still had zero
padding: if `ios:refresh` reports no connected client but Safari Inspector is
responsive, reload the inspected WebView and verify the rendered styles.

### iPad Content Width After Resuming

On an iPad mini running iPadOS 26.4, backgrounding RouteVN and returning to
Images could leave the content at 561.5px while the app shell, `innerWidth`, and
`visualViewport.width` remained 1133px. Safari Inspector confirmed that even a
fresh `width: 100vw` element measured 561.5px in this state. The bottom tabs used
the parent layout and remained full width.

The app store now uses the parent-relative `100%` for iOS content width,
including the sidebar subtraction when applicable. Android and web retain their
existing widths. Changing the narrow container to `100%` restored 1133px
immediately, and the installed fix kept Images at 1133px through three native
background/resume cycles without restarting the app process.

With `watch:ios` running, `node tests/ios/appWidth.browser.mjs` checks the actual
app view and Images content against changing container widths and verifies
Android/web layouts at phone and iPad sizes in Chromium and WebKit. The stale
viewport-unit behavior itself requires a physical iPad to reproduce.

### iPad Crop Dialog and Video Preview Width

The same iPad resume issue also affects `rtgl-dialog`: a physical iPad mini on
iPadOS 26.4 reported `100vw = 561.5px` in a 1133px window, while `100dvw`,
`100svw`, and `100lvw` remained 1133px. A small crop dialog shrank to 219px,
leaving its fixed 320px crop surface outside the dialog. Resetting the viewport
meta tag did not repair the stale legacy unit.

The shared dialog fix from
[Rettangoli PR #477](https://github.com/yuusoft-org/rettangoli/pull/477) is
published in `@rettangoli/ui` 1.22.1, which the client now uses through its normal
registry dependency. It prefers dynamic viewport widths and guards dynamic
calculations with `@supports` so older browsers retain the legacy fallbacks.

The client crop dialog uses the standard medium size. Its crop surface scales
to the available width up to 400px, and image positions/dimensions render as
percentages of the logical crop coordinates. Resizing preserves the selection,
pointer movement, and exported image area. The image remains clipped inside the
square viewport. Video previews fill their stage with `object-fit: contain` and
center the image while preserving its aspect ratio.

With the upstream development build, physical background/resume checks kept the
crop dialog at 600.5px with a centered 400px square, and kept the video stage at
1133px wide. The video X button closed the preview successfully. Run
`node tests/squareImageCropper/squareImageCropper.browser.mjs` for Chromium and
WebKit coverage of phone/tablet resizing, proportional dragging, stable selection,
and cropped export pixels. The upstream PR includes separate dialog layout
checks with injected stale legacy viewport units.

### Status Bar Theme

The native status-bar foreground follows the app's Config theme, independently
of the phone's system theme. The shared app service applies the document theme
and calls an optional platform theme adapter, both when loading saved settings
and when changing themes. The iOS adapter uses `isDarkTheme` to send
`setStatusBarStyle` through the bridge: Dark, Black, and Catppuccin Mocha use
light indicators; Light uses dark indicators. `RouteVNViewController` stores
that style and calls `setNeedsStatusBarAppearanceUpdate()` when it changes.
The status-bar background remains the page's theme-colored safe area.
Installing the native bridge requires one shell rebuild; subsequent theme
changes take effect immediately without a reload or rebuild.
Validated on the connected iPhone with Config theme-card clicks and native
screenshots for all four themes, including restoration of Light and its dark
indicators after an app restart. `tests/ios/statusBarTheme.test.js` covers Config
changes, saved-theme startup, legacy theme normalization, native failure feedback,
and shared theme behavior without an iOS adapter.

An attempted native root-scroll lock disabled the WebView's scroll gestures and
reset its content offset from `UIScrollViewDelegate`. Physical iPhone testing
then reported that tapping dialogue no longer opened the keyboard. That approach
was removed, including its route policy; preserve WebKit's normal native scroll
and focus handling. Unit tests and a successful native build did not validate
keyboard presentation, so any replacement needs physical-device verification of
keyboard opening, typing, dismissal, and nested dialogue scrolling.

Removing WKWebView's keyboard notification observers (an experiment based on
Capacitor's overlay mode) also failed on the connected iOS 16.3.1 phone. The
device trace showed an editable element with focus, but no visible keyboard or
keyboard-frame notification. That experiment was reverted as well.

Physical XCTest execution is currently blocked with Xcode 26.6 and this iOS 16
device: test bundles build and sign, but `test-without-building` rejects them
with `Logic Testing Unavailable`. An
[Xcode 26.4/iOS 16 report](https://developer.apple.com/forums/thread/820586)
describes the same failure. This is a test-runner limitation, not evidence that
keyboard interactions pass.

The fixed mobile surface and actions panel still follow the toolbar's visual
viewport offset if WebKit pans for another reason. That correction alone cannot
prevent an initial jump, because it renders after the native focus scroll.

Android's virtual-keyboard overlay path reports a zero viewport offset, so it
keeps the existing top position. Desktop uses its existing separate layout.
Their platform adapters are unchanged.

The iOS focus event and lifecycle cases live in
`tests/ios/sceneEditorKeyboard.test.js`; the viewport positioning regression
cases live in `tests/sceneEditor/sceneEditor.store.test.js`.
For the separate caret-to-line-end fallback bug on older WebKit, see
[Lexical pointer selection](notes/lexical-pointer-selection.md).
For physical validation, open and close the scene keyboard, scroll the dialogue
list, and open the actions panel. The canvas should stay at the visible top and
the panel should start directly below it. See the
[VisualViewport positioning example](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport#examples)
for the distinction between the layout and visible viewports.

### Platform Clients

iOS uses native adapters instead of Tauri mobile APIs.

- Router: `src/deps/clients/ios/router.js`
- SQLite: `src/deps/clients/ios/sqlite.js`
- File picker: `src/deps/clients/ios/filePicker.js`
- Project services: `src/deps/services/ios/`

The native bridge in `RouteVNApp.swift` handles:

- route back-state updates
- external URL opening
- SQLite open/query/exec/close
- project file read/write/metadata
- download writes
- streamed distribution ZIP export
- iOS document picker results
- image and video uploads offer Photo Library and Choose Files; Photos uses the
  system picker filtered to the accepted media, with single or multiple selection
- local project folder import/export

Photo selections use the same temporary picker storage and upload validation
as files selected from Files. JPEG, PNG, and WebP representations are preserved;
other Photos formats, such as HEIC, are converted to an accepted JPEG or PNG.
Video selections preserve accepted formats. Camera MOV clips are converted to
MP4 when required by the Videos page, using AVFoundation; temporary source and
converted files are removed after import or failure. The picker grants access
only to selected items, so this flow does not request full photo-library
permission. Requests that include non-image/non-video files still open Files
directly.

On the physical iOS 16.3.1 phone, Videos → Upload was verified to offer Photo
Library and Choose Files, and Photo Library opened a video-only gallery. A gallery clip successfully reached JavaScript processing, but thumbnail extraction
initially timed out: iOS 16.3.1 left the detached blob video at `HAVE_METADATA`
(`readyState === 1`), despite `preload="auto"`. Seeking alone did not produce a
frame. A delayed muted `play()` followed by `pause()` advanced it to
`HAVE_ENOUGH_DATA` and allowed seeking/drawing; this matches WebKit's
[preload limitation](https://bugs.webkit.org/show_bug.cgi?id=197608).

The iOS file adapter supplies `prepareIOSVideoForThumbnail` to both thumbnail
extraction paths. It starts the muted decoder, pauses before sampling, and bounds
startup to five seconds. Timeout, rejection, and late play completion all pause
the element. Other platforms do not install this hook. The native WebView allows
inline media so this hidden decode cannot open a fullscreen player; thumbnail
videos already set `muted` and `playsInline`.

The Videos page preview also sets `playsinline`, so playback stays inside the
app dialog instead of automatically opening a second native fullscreen player.
Its Close toolbar reserves the top safe area using
`--rvn-mobile-overlay-top-inset`, with the current theme background behind the
status bar. The player also reserves the bottom and landscape side safe areas.
Closing the dialog pauses playback before removing the video.
On the physical iPhone, the Close control started at 53px below the 47px status
bar inset. Two open/close cycles kept native fullscreen inactive and removed the
paused video when closed; a screenshot confirmed the toolbar remained visible.

After installing the fix, the same two-second H.264 test clip processed through
the real iPhone upload service in 1.334 seconds without an inspector-provided
user gesture. It produced a nonempty JPEG thumbnail and both native stored
files were fetched successfully. A physical screenshot confirmed the Videos
page remained visible throughout decoding. The temporary test files were
removed afterward.

## Validation

### OGG audio uploads and previews

The iOS 16.3.1 phone rejects OGG Vorbis and Opus in `decodeAudioData` with
`EncodingError: Decoding failed`. WebKit added native OGG support in
[iOS 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/).
The existing `route-graphics` fallback only covered its own audio loader:
Creator's upload waveform extraction, sound preview service, and managed
graphics audio loader each decoded natively and bypassed that fallback.

These paths now share `src/deps/clients/audioDecoder.js`. It tries native
decoding first, preserving the original bytes because native decoding can
detach its input. After an OGG failure it uses the same published Vorbis/Opus
decoder packages as `route-graphics`, declared as direct dependencies. The
codec is detected from the OGG identification packet, including when the iOS
picker supplies `application/octet-stream`. Each fallback decoder is freed
after use. Unsupported or damaged files still fail, and stored OGG files retain
their original bytes.

Physical-device checks uploaded two-second stereo Vorbis and Opus fixtures
through the project upload service, read back their native stored files, and
played them through the app's iOS audio output. Both produced nonempty
1,000-sample waveforms and two-second durations; playback advanced with a live
output track, then stopped cleanly. An MP3 control passed the same checks. All
six temporary audio/waveform files were deleted afterward. Regression tests
cover both real codecs, upload waveforms, preview playback, input detachment,
native-success behavior, and invalid input.

### Other checks

Current simulator-safe checks:

- `bun run ios:run -- --simulator "iPhone 17" --smoke-test`
- ZIP integrity check on the smoke-test export
- iOS adapter tests under `tests/ios/`
- dev workflow tests in `tests/ios/devWorkflow.test.js` (real WebSocket reload,
  transformed iOS HTML, and device commands without builds or installs)
- shared mobile viewport/unit tests under `tests/`

The adapter tests cover:

- iOS router stack persistence
- file picker fallback and native-result cleanup
- save picker and selected-file writes
- opaque folder-picker URI forwarding
- native streamed ZIP export delegation
- JavaScript ZIP fallback writes to the selected URI
- disabled remote collaboration behavior

## Current Device Test Needs

Simulator is enough for initial shell, SQLite, and packaged asset validation.
A physical iPhone or iPad is needed before trusting:

- Files app document provider behavior
- security-scoped folder import/export across providers such as iCloud Drive
- camera/photo/document picker edge cases
- real touch keyboard and safe-area behavior
- any release signing or install-on-device flow
