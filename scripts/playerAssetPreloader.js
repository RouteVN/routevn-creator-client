// Loads the lookahead plan in the background, one asset at a time, so the
// work never competes with a screen the player is waiting for. A screen that
// needs an asset right now loads it directly and does not wait for this queue.
export const createPlayerAssetPreloader = ({
  loadAsset,
  canLoad,
  onError,
  schedule = (run) => setTimeout(run, 0),
}) => {
  const failedAssetIds = new Set();
  let pending = [];
  let loading = false;

  const loadNext = async () => {
    // A screen is waiting for its own assets. The next plan restarts the queue.
    if (loading || pending.length === 0 || !canLoad()) {
      return;
    }

    const assetId = pending.shift();
    loading = true;
    try {
      await loadAsset(assetId);
    } catch (error) {
      // The asset is not on screen yet. If the story reaches it, the normal
      // load reports the failure.
      failedAssetIds.add(assetId);
      onError?.(error, { assetId });
    }
    loading = false;
    schedule(loadNext);
  };

  return {
    // Replaces the queue, so assets the story no longer leads to are dropped.
    setPlan(assetIds) {
      pending = assetIds.filter((assetId) => !failedAssetIds.has(assetId));
      schedule(loadNext);
    },
  };
};
