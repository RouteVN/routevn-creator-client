const isProjectPath = (path) =>
  path === "/project" || path.startsWith("/project/");

// `window.routeVNNativeBack`. The Android shell calls it for the system Back
// and leaves the app when it returns false; the iOS setup defines the same
// handler. Back closes the topmost open overlay first, one per press: a
// dialog, popover or menu, then an overlay that consumes `app.nativeBack` such
// as the preview, then a sheet or panel. With nothing open it goes back in the
// route stack.
export const createNativeBackHandler = ({
  subject,
  appService,
  overlays,
  notifyBackState,
  // Android only: in a project with nothing behind it in the route stack,
  // Back opens the Projects list, as Back to Projects does, instead of
  // leaving the app.
  openProjectsFromProject = false,
  platformName,
}) => {
  let backInFlight = false;

  const closeTopmostOverlay = () => {
    if (overlays.closeTopmostDialog()) {
      return true;
    }

    const backRequest = {
      handled: false,
      handle() {
        this.handled = true;
      },
    };
    subject.dispatch("app.nativeBack", backRequest);
    if (backRequest.handled) {
      return true;
    }

    return overlays.closeTopmostPanel();
  };

  return () => {
    if (closeTopmostOverlay()) {
      notifyBackState();
      return true;
    }

    if (!appService.canGoBack()) {
      notifyBackState();
      if (openProjectsFromProject && isProjectPath(appService.getPath())) {
        appService.backToProjects();
        return true;
      }
      return false;
    }

    if (backInFlight) {
      return true;
    }

    backInFlight = true;
    void appService
      .back()
      .catch((error) => {
        console.error(
          `Failed to prepare ${platformName} back navigation:`,
          error,
        );
        const copy = appService.getAppCopy();
        appService.showToast({
          title: copy.errorTitle ?? "Error",
          message: copy.failedGoBack ?? "Could not go back. Please try again.",
          status: "error",
        });
      })
      .finally(() => {
        backInFlight = false;
        notifyBackState();
      });

    return true;
  };
};
