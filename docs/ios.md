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
- app-private project storage under iOS Application Support
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

Internal project and picker files are served through:

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
Native SQLite/project files stay in the same app container when switching
modes; origin-specific WebView storage (such as the remembered route) differs.

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

### Scene Editor Keyboard Position

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
- image-only uploads offer Photo Library and Choose Files; Photos uses the
  system photo picker with single or multiple selection
- local project folder import/export

Photo selections use the same temporary picker storage and upload validation
as files selected from Files. JPEG, PNG, and WebP representations are preserved;
other Photos formats, such as HEIC, are converted to an accepted JPEG or PNG.
The photo picker grants access only to the selected photos, so this flow does
not request full photo-library permission. Non-image and mixed-file requests
continue to open Files directly.

## Validation

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
