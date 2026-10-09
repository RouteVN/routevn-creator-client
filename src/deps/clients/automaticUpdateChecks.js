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
    const performCheck = async ({ force = false, trigger } = {}) => {
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
            await checkForUpdates(true, { copy: getCopy(), trigger });
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

    // The forced first check reports the app launch; the ten-minute timer
    // that finds the two-hour threshold elapsed reports a periodic check.
    void performCheck({ force: true, trigger: "launch" });
    intervalId = setInterval(
      () => void performCheck({ trigger: "periodic" }),
      10 * 60 * 1000,
    );
  };
};
