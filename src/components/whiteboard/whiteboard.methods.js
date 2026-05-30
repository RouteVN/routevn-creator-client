export function ensureItemVisible(payload = {}) {
  return this.transformedHandlers.handleEnsureItemVisible({
    _event: {
      detail: payload,
    },
  });
}
