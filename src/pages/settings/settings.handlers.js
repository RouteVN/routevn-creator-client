export const handleBeforeMount = () => {
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

export const handleDataChanged = () => {
  // Handle file explorer data changes
};

export const handleCheckForUpdates = async (payload, deps) => {
  const { updaterService } = deps;

  // Check for updates with UI feedback
  await updaterService.checkForUpdates(false);
};
