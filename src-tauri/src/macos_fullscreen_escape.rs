use std::ffi::c_void;

unsafe extern "C" {
    fn routevn_install_fullscreen_escape_focus_guard(window: *mut c_void, webview: *mut c_void);
}

pub fn install(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    window.with_webview(|webview| {
        // SAFETY: with_webview runs on the main thread and supplies live native
        // handles. The monitor holds weak references and removes itself on close.
        unsafe {
            routevn_install_fullscreen_escape_focus_guard(webview.ns_window(), webview.inner());
        }
    })
}
