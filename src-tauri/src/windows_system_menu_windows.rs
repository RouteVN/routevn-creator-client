use windows::Win32::Foundation::{HWND, LPARAM, POINT, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, GetSystemMenu, PostMessageW, SetForegroundWindow, TPM_RETURNCMD, TPM_RIGHTBUTTON,
    TrackPopupMenuEx, WM_NULL, WM_SYSCOMMAND,
};

pub fn show(hwnd: HWND) -> Result<(), String> {
    let mut cursor = POINT::default();

    // SAFETY: hwnd belongs to the live Tauri window, cursor points to valid writable
    // memory, and the menu remains owned by hwnd for the duration of this call.
    unsafe {
        GetCursorPos(&mut cursor)
            .map_err(|error| format!("failed to read the cursor position: {error}"))?;

        let menu = GetSystemMenu(hwnd, false);
        if menu.0.is_null() {
            return Err("failed to access the Windows system menu".to_string());
        }

        let _ = SetForegroundWindow(hwnd);
        let command = TrackPopupMenuEx(
            menu,
            TPM_RETURNCMD.0 | TPM_RIGHTBUTTON.0,
            cursor.x,
            cursor.y,
            hwnd,
            None,
        );

        let command_result = if command.0 == 0 {
            Ok(())
        } else {
            PostMessageW(
                Some(hwnd),
                WM_SYSCOMMAND,
                WPARAM(command.0 as usize),
                LPARAM(0),
            )
            .map_err(|error| format!("failed to run the system menu command: {error}"))
        };

        let _ = PostMessageW(Some(hwnd), WM_NULL, WPARAM(0), LPARAM(0));
        command_result
    }
}
