export function scrollItemIntoView(payload = {}) {
  return this.transformedHandlers.handleScrollItemIntoView(payload);
}

export function setGroupCollapsed(payload = {}) {
  return this.transformedHandlers.handleSetGroupCollapsed(payload);
}

export function zoomIn(payload = {}) {
  return this.transformedHandlers.handleZoomIn(payload);
}

export function zoomOut(payload = {}) {
  return this.transformedHandlers.handleZoomOut(payload);
}
