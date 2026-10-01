// Crashes the app on purpose so desktop error reporting can be checked on
// release builds. Only a project created with a test crash name reaches this
// (see src/internal/testCrashes.js). Returns false for kinds the desktop app
// does not report, so the app carries on normally.
#[tauri::command]
pub fn trigger_test_crash(kind: String) -> bool {
    if kind != "panic" {
        return false;
    }
    // Sync commands run in the webview's IPC callback on the main thread, which
    // nothing catches, so the app exits once the panic hook has sent the report.
    panic!("RouteVN test panic");
}
