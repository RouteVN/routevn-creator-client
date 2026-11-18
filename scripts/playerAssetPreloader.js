// Loads the lookahead plan in the background, one asset at a time, so the
// work never competes with a screen the player is waiting for. A screen that
// needs an asset right now loads it directly and does not wait for this queue.
export const MAX_PRELOAD_ATTEMPTS = 3;

export const createPlayerAssetPreloader = ({
  loadAsset,
  canLoad,
  onError,
  schedule = (run) => setTimeout(run, 0),
}) => {
  const failureCounts = new Map();
  let pending = [];
  let loading = false;

  const hasGivenUp = (assetId) =>
    (failureCounts.get(assetId) ?? 0) >= MAX_PRELOAD_ATTEMPTS;

  const loadNext = async () => {
    // A screen is waiting for its own assets. The next plan restarts the queue.
    if (loading || pending.length === 0 || !canLoad()) {
      return;
    }

    const assetId = pending.shift();
    loading = true;
    try {
      await loadAsset(assetId);
      failureCounts.delete(assetId);
    } catch (error) {
      // The asset is not on screen yet. A later plan tries it again, since a
      // read can fail once and then work. If the story reaches the asset, the
      // normal load reports the failure.
      failureCounts.set(assetId, (failureCounts.get(assetId) ?? 0) + 1);
      onError?.(error, { assetId });
    }
    loading = false;
    schedule(loadNext);
  };

  return {
    // True once an asset has failed `MAX_PRELOAD_ATTEMPTS` times in a row. It
    // is not loaded ahead again.
    hasGivenUp,
    // Replaces the queue, so assets the story no longer leads to are dropped.
    setPlan(assetIds) {
      pending = assetIds.filter((assetId) => !hasGivenUp(assetId));
      schedule(loadNext);
    },
  };
};
