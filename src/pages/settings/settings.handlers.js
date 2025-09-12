export const handleBeforeMount = (deps) => {
  // Initialize settings
};

export const handleAfterMount = async (deps) => {
  const { store, render, appVersion } = deps;

  // Set app version from deps
  if (appVersion) {
    store.setAppVersion(appVersion);
  }

  render();
};

export const handleDataChanged = (e, deps) => {
  const { store } = deps;
  // Handle file explorer data changes
};

export const handleCheckForUpdates = async (payload, deps) => {
  const { updaterService } = deps;

  // Check for updates with UI feedback
  await updaterService.checkForUpdates(false);
};
