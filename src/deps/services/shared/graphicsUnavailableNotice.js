import { withErrorDetails } from "../../../internal/errorDetails.js";

// Tells the user, once at a time, that the device cannot show graphics. Any
// page can start graphics, and most have nothing to say about it themselves,
// so the graphics service calls this when WebGL cannot start. The specific
// message leads, with the technical details after it.
export const createGraphicsUnavailableNotifier = ({ appService }) => {
  let alertOpen = false;

  return (error) => {
    console.error("[graphics] The device cannot create a WebGL context", error);
    if (alertOpen) {
      return;
    }
    alertOpen = true;

    const copy = appService.getAppCopy();
    const closed = appService.showAlertWhenIdle({
      title: copy.errorTitle ?? "Error",
      message: withErrorDetails(
        copy.graphicsUnavailableMessage ??
          "This device cannot display the preview or the canvas editors because it could not start WebGL graphics. Restart the app or the device. Updating the system web view, browser or graphics driver may also help.",
        error,
        copy.errorDetailsLabel ?? "Details:",
      ),
    });
    Promise.resolve(closed)
      .catch(() => {})
      .finally(() => {
        alertOpen = false;
      });
  };
};
