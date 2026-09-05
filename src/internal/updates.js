export const resolveUpdatesEnabled = ({
  appService,
  updatesEnabled,
  updaterService,
} = {}) => {
  if (updatesEnabled !== undefined) {
    return Boolean(updatesEnabled);
  }

  if (appService?.getPlatform?.() === "web") {
    return false;
  }

  if (updaterService?.isSupported) {
    return updaterService.isSupported();
  }

  return Boolean(updaterService);
};
