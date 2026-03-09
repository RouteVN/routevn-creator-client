export function syncContentLine(payload = {}) {
  this.transformedHandlers.forceSyncContentLine(payload);
}

export function syncAllContentLines() {
  this.transformedHandlers.forceSyncAllContentLines({});
}
