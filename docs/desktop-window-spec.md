# Desktop window keyboard behavior

These contracts apply to the native Creator window on every page. In-page
preview dismissal and a web browser's own fullscreen controls are separate.

| ID      | Required behavior                                                                                                                                                                                                                                       | Coverage                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| WIN-001 | Exiting native fullscreen with Escape requires two distinct presses within 1.5 seconds. The first press keeps the window fullscreen and shows a hint. Holding the key does not confirm.                                                                 | `tests/tauri/fullscreenEscape.test.js`; both window Escape browser suites; native macOS check |
| WIN-002 | Escape consumed by an editor, dialog, or IME does not count toward fullscreen exit. A dialog that closes during key dispatch still owns that Escape.                                                                                                    | Native-titlebar unit/browser suites; existing custom-chrome browser suite                     |
| WIN-003 | Other typing, focus loss, or expiration requires a fresh confirmation pair. Native-titlebar protection also resets on pointer input, resize, and dialog cancellation.                                                                                   | Native-titlebar unit/browser suites; custom-chrome unit suite                                 |
| WIN-004 | Native-titlebar protection does not restore a merely maximized window. Window buttons and other explicit fullscreen controls retain their existing behavior. Custom Windows chrome retains its existing double-Escape restore behavior.                 | Native-titlebar and custom-chrome unit suites                                                 |
| WIN-005 | Pending native state queries cannot restore fullscreen after the user changes context or the app subscription is disposed. Failed native requests show localized feedback and require a new pair.                                                       | Native-titlebar client and app lifecycle unit tests                                           |
| WIN-006 | Clicking native macOS window controls must not bypass confirmation when the window itself has keyboard focus. Escape is returned to the webview only when no inner responder owns it; native sheets and other windows keep their own keyboard handling. | Native macOS `window-focus` regression; verified in the development app                       |

macOS previously had no app-level Escape protection: the custom Windows title
bar's confirmation handler was not installed there. An isolated AppKit/WKWebView
test reproduced a single Escape leaving fullscreen. The native-titlebar client
now cancels that default synchronously, then checks native window state and
performs a confirmed exit through Tauri. The app mounts the subscription once,
so it is shared across routes and cleans up with the app lifecycle.

A follow-up reproduction in RouteVN Creator Dev exposed a native focus gap:
close the docked inspector (or otherwise leave the window itself focused),
click the green fullscreen button, and press Escape without clicking the page.
AppKit received Escape directly, bypassing the JavaScript listener. Clicking
inside the page first concealed the bug. The macOS shell now routes that real
keyboard event back to WKWebView before native dispatch, where existing dialog,
editor, and double-Escape handling applies. The monitor is scoped to the main
window, uses weak window/view references, and is removed when the window closes.
Native changes require rebuilding/restarting the desktop app; frontend hot reload
alone cannot install the guard.

Run the automated unit and Chromium/WebKit gate (also run on PRs):

```sh
bun run test:window-controls
```

On macOS, verify the production client against a real fullscreen native window:

```sh
node tests/windowChrome/nativeFullscreenEscape.macos.mjs
```

The native check requires Xcode command-line tools and a GUI session. It opens
isolated test windows with both webview and native-window keyboard focus,
verifies the first and second Escape presses, then closes them. It compiles the
same Objective-C focus guard shipped by the Tauri shell. The first press must
reach the JavaScript confirmation handler, and fullscreen exit must come from
the confirmed native bridge request. Checking fullscreen state alone is not
sufficient: the exit animation can briefly leave that state true after a single
Escape has already started exiting. It does not open user projects. Browser
tests simulate the Tauri API; the native companion uses AppKit window state and
WKWebView keyboard dispatch.
