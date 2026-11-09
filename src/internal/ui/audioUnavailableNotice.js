import { isAudioAvailable } from "../../deps/clients/audioAvailability.js";
import { withErrorDetails } from "../errorDetails.js";

// Opening a preview warns once per app session. A play button warns on every
// press, since the user asked for sound.
let previewNoticeShown = false;

export const showAudioUnavailableNotice = ({ appService, i18n }) => {
  const copy = i18n?.appPage ?? {};
  let message =
    copy.audioUnavailable ?? "Audio isn't available on this device right now.";
  // Lockdown Mode turns off Web Audio in iOS web views.
  if (appService.getPlatform() === "ios") {
    message = `${message} ${
      copy.audioUnavailableLockdownHint ??
      "If Lockdown Mode is on, you can turn it off for RouteVN in Settings."
    }`;
  }
  appService.showAlert({
    title: copy.errorTitle ?? "Error",
    message: withErrorDetails(
      message,
      new Error("Web Audio is not available"),
      copy.errorDetailsLabel ?? "Details:",
    ),
  });
};

export const warnIfAudioUnavailable = (deps) => {
  if (isAudioAvailable()) return false;
  showAudioUnavailableNotice(deps);
  return true;
};

export const warnOnceIfAudioUnavailable = (deps) => {
  if (isAudioAvailable() || previewNoticeShown) return;
  previewNoticeShown = true;
  showAudioUnavailableNotice(deps);
};
