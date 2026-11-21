// The engine records a render state as shown as soon as it hands it over, and
// builds the next state's audio effects from that record. A state that needs
// assets cannot be drawn until they load, so states wait here and are drawn in
// the order the engine produced them. Skipping a waiting state would leave the
// engine fading out music the renderer never started.
export const createPlayerRenderQueue = ({
  collectMissingAssetIds,
  ensureAssetsLoaded,
  render,
  onRendered,
  onAssetLoadStart,
  onAssetLoadError,
}) => {
  let waiting = [];
  let stopped = false;

  const renderState = (state) => {
    render(state);
    onRendered?.(state);
  };

  const renderReadyStates = () => {
    while (waiting[0]?.ready) {
      renderState(waiting.shift().renderState);
    }
  };

  const enqueue = (state) => {
    if (stopped) {
      return;
    }

    const assetIds = collectMissingAssetIds(state);
    if (assetIds.length === 0 && waiting.length === 0) {
      renderState(state);
      return;
    }

    const entry = { renderState: state, ready: assetIds.length === 0 };
    waiting.push(entry);
    if (entry.ready) {
      return;
    }

    onAssetLoadStart?.({ assetIds });
    void ensureAssetsLoaded(assetIds).then(
      () => {
        if (stopped) {
          return;
        }

        entry.ready = true;
        renderReadyStates();
      },
      (error) => {
        if (stopped) {
          return;
        }

        // The states behind a failed one cannot be drawn in order any more.
        stopped = true;
        waiting = [];
        onAssetLoadError?.(error, { assetIds });
      },
    );
  };

  return {
    enqueue,
    // True while the screen still shows a state the engine has already left.
    hasWaitingStates: () => waiting.length > 0,
    getWaitingStates: () => waiting.map((entry) => entry.renderState),
  };
};
