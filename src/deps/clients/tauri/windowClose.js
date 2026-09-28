import { getCurrentWindow } from "@tauri-apps/api/window";
import { flushDesktopErrors } from "./errorReporting.js";

export async function setupCloseListener(deps) {
  const { globalUI } = deps;
  const appWindow = getCurrentWindow();
  try {
    let isClosing = false;

    const listener = await appWindow.onCloseRequested(async (event) => {
      if (isClosing) return; // Prevent infinite loop

      event.preventDefault();

      const confirmQuit = await globalUI.showConfirm({
        message: `Are you sure you want to quit the application?`,
        title: "Confirm",
        confirmText: "Quit",
        cancelText: "Cancel",
      });

      if (confirmQuit) {
        isClosing = true; // Set flag to prevent loop
        try {
          await flushDesktopErrors();
        } catch {
          // Error reporting must not prevent the app from closing.
        }
        await appWindow.close();
        isClosing = false; // Reset flag (though window will be closed)
      }
    });
    return listener;
  } catch (e) {
    console.error("Failed to set up close listener:", e);
  }
}
