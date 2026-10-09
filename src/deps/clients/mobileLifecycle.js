// Pages keep edits in memory for a few seconds before saving them, and the
// system may end the app once it is in the background. Save them as the app
// leaves the foreground, with the activity signal the audio already follows:
// the native pause callback and the page becoming hidden.
export const saveWhenAppGoesInactive = ({ runtime, appService }) =>
  runtime.subscribeActivity((isActive) => {
    if (!isActive) {
      void appService.saveBeforeSuspend("background");
    }
  });
