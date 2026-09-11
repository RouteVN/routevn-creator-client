import { Observable, shareReplay } from "rxjs";

const WINDOW_METRICS_EVENT = "routevn:window-metrics";

// Native window bounds use logical pixels and exclude keyboard occlusion.
// The visual viewport remains the separate source for keyboard positioning.
export const createWindowMetricsClient = ({
  loadMetrics,
  windowTarget = globalThis.window,
}) => {
  let metrics;
  const changes = new Observable((subscriber) => {
    let active = true;
    let receivedEvent = false;
    const publish = (value) => {
      if (!active || !(value.width > 0) || !(value.height > 0)) return;
      metrics = { width: value.width, height: value.height };
      subscriber.next(metrics);
    };
    const onChange = (event) => {
      receivedEvent = true;
      publish(event.detail);
    };
    windowTarget.addEventListener(WINDOW_METRICS_EVENT, onChange);
    void loadMetrics()
      .then((value) => {
        if (!receivedEvent) publish(value);
      })
      .catch((error) => {
        // Older development shells keep the existing stacked layout until rebuilt.
        if (active) console.warn("Native window metrics unavailable", error);
      });
    return () => {
      active = false;
      windowTarget.removeEventListener(WINDOW_METRICS_EVENT, onChange);
    };
  }).pipe(shareReplay({ bufferSize: 1, refCount: true }));

  return {
    getMetrics: () => metrics,
    subscribe(listener) {
      const subscription = changes.subscribe(listener);
      return () => subscription.unsubscribe();
    },
  };
};
