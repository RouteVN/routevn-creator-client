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

  return Boolean(updaterService);
};
