export function getCanvasRoot() {
  const canvasHost = this.shadowRoot?.querySelector(
    "#actionTransformCanvasHost",
  );
  return (
    canvasHost?.getCanvasRoot?.() ||
    canvasHost?.shadowRoot?.querySelector?.("#canvas") ||
    canvasHost?.querySelector?.("#canvas")
  );
}

export function setTransientTransform(payload = {}) {
  return this.transformedHandlers.setTransientTransform(payload);
}
