export function zoomIn(payload = {}) {
  return this.transformedHandlers.handleZoomIn(payload);
}

export function zoomOut(payload = {}) {
  return this.transformedHandlers.handleZoomOut(payload);
}
