export const createAutomaticUpdateChecks = ({
  checkForUpdates,
  keyValueStore,
  shouldCheck = () => true,
}) => {
  let intervalId;
  let checking = false;

  return (options = {}) => {
    if (intervalId !== undefined) return;
    const getCopy = options.getCopy ?? (() => options.copy ?? {});
    const performCheck = async ({ force = false } = {}) => {
      if (checking || !shouldCheck()) return;
      checking = true;
      try {
        const lastCheckTime = await keyValueStore.get("lastCheckTime");
        const currentTime = Date.now();
        if (
          force ||
          !lastCheckTime ||
          currentTime - lastCheckTime > 2 * 60 * 60 * 1000
        ) {
          try {
            await checkForUpdates(true, { copy: getCopy() });
          } finally {
            await keyValueStore.set("lastCheckTime", currentTime);
          }
        }
      } catch (error) {
        console.error("Automatic update check failed:", error);
      } finally {
        checking = false;
      }
    };

    void performCheck({ force: true });
    intervalId = setInterval(performCheck, 10 * 60 * 1000);
  };
};
