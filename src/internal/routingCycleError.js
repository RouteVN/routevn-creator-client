// route-engine-js stops an immediate routing cycle with this code. When the
// engine's own cleanup also fails, the error arrives inside an AggregateError.
export const isRoutingCycleError = (error) =>
  error?.code === "routing_cycle" ||
  (error?.errors ?? []).some(isRoutingCycleError);
