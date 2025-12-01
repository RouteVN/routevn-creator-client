import { getCurrentWindow } from "@tauri-apps/api/window";

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
        await appWindow.close();
        isClosing = false; // Reset flag (though window will be closed)
      }
    });
    console.log("Close listener set up successfully.");
    return listener;
  } catch (e) {
    console.error("Failed to set up close listener:", e);
  }
}
