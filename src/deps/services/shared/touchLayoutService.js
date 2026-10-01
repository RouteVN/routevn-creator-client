import { isTouchLandscape } from "../../../internal/touchLayout.js";

// The app-wide touch landscape flag, so pages can adapt to tablets without
// reading window metrics themselves. Only native shells report window
// metrics; web and desktop are never in touch landscape.
export const createTouchLayoutService = ({ windowMetricsClient, uiConfig }) => {
  if (!windowMetricsClient) {
    return {
      isTouchLandscape: () => false,
      subscribeTouchLandscape: () => () => {},
    };
  }

  const isTouchMode = uiConfig.id === "touch";
  const fromMetrics = (metrics) =>
    isTouchLandscape({
      isTouchMode,
      width: metrics?.width ?? 0,
      height: metrics?.height ?? 0,
    });

  // Metrics only update while subscribed; keep them current for the
  // synchronous getter for the app's lifetime.
  windowMetricsClient.subscribe(() => {});

  return {
    isTouchLandscape: () => fromMetrics(windowMetricsClient.getMetrics()),

    // Calls listener with the current flag once metrics load, then only when
    // it flips, not on every resize.
    subscribeTouchLandscape(listener) {
      let current;
      return windowMetricsClient.subscribe((metrics) => {
        const next = fromMetrics(metrics);
        if (next === current) return;
        current = next;
        listener(next);
      });
    },
  };
};
