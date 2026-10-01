// Project names that crash the Android, iOS or desktop app on purpose, so
// crash reporting can be checked on release builds, where no debugger or shell
// signal can do it. Creating a project with one of these names crashes the app
// instead of creating the project. See docs/mobile-crash-reporting.md.
const TEST_CRASH_KINDS = new Map([
  // A Rust panic in the Android native library or the desktop app; a Swift
  // fatalError on iOS.
  ["ROUTEVN_TEST_PANIC_CRASH", "panic"],
  // An invalid memory write in the Android native library, or in Swift on iOS.
  // Desktop does not report this.
  ["ROUTEVN_TEST_NATIVE_CRASH", "native"],
  // An uncaught Java exception on Android; an uncaught NSException on iOS; an
  // uncaught webview error on desktop, which does not crash the app.
  ["ROUTEVN_TEST_APP_CRASH", "app"],
  // A crashed Android WebView renderer. iOS and desktop do not report this.
  ["ROUTEVN_TEST_WEBVIEW_CRASH", "webview"],
]);

export const readTestCrashKind = (name) => TEST_CRASH_KINDS.get(name);
