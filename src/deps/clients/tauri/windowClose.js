import { getCurrentWindow } from "@tauri-apps/api/window";
import { flushDesktopErrors } from "./errorReporting.js";

// Saving must not keep the user from quitting if it hangs.
export const QUIT_SAVE_TIMEOUT_MS = 5000;

const saveBeforeQuit = async (appService) => {
  let timer;
  try {
    await Promise.race([
      appService.saveBeforeSuspend("quit"),
      new Promise((resolve) => {
        timer = setTimeout(resolve, QUIT_SAVE_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // Saving must not prevent the app from closing.
  } finally {
    clearTimeout(timer);
  }
};

export async function setupCloseListener(deps) {
  const { appService, globalUI } = deps;
  const appWindow = getCurrentWindow();
  try {
    // "quitting" while the confirmation and the save run, "closing" once the
    // window closes itself.
    let quitState = "idle";

    const listener = await appWindow.onCloseRequested(async (event) => {
      if (quitState === "closing") return; // Our own close goes through

      event.preventDefault();
      // Another close request while asking or saving must not close the
      // window under the save.
      if (quitState === "quitting") return;
      quitState = "quitting";

      try {
        const confirmQuit = await globalUI.showConfirm({
          message: `Are you sure you want to quit the application?`,
          title: "Confirm",
          confirmText: "Quit",
          cancelText: "Cancel",
        });
        if (!confirmQuit) return;

        // What the open page has not saved yet would be lost with the window.
        await saveBeforeQuit(appService);
        try {
          await flushDesktopErrors();
        } catch {
          // Error reporting must not prevent the app from closing.
        }
        // Stays "closing": the close request this causes can arrive after
        // close() resolves, and must go through without asking again.
        quitState = "closing";
        try {
          await appWindow.close();
        } catch (error) {
          quitState = "idle";
          throw error;
        }
      } finally {
        // Cancelled: ask again next time.
        if (quitState === "quitting") quitState = "idle";
      }
    });
    return listener;
  } catch (e) {
    console.error("Failed to set up close listener:", e);
  }
}
