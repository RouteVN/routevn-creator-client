export const ZOOM_VIEWPORT_TAG_NAME = "rvn-zoom-viewport";

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 10;
// Movement before a pan or pinch swallows the click that follows it.
const CLICK_SLOP_PX = 4;
const WHEEL_ZOOM_SETTLE_MS = 150;
const WHEEL_ZOOM_RATE = 0.01;

const clampZoom = (zoom) =>
  Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) * 100) / 100;

const getDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const getMidpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// Owns a scrolling canvas workspace: the zoom of its content, which sizes
// itself from the --canvas-zoom variable, and keeping the point in view in
// place while the zoom changes. The zoom attribute sets it.
//
// With the gestures attribute, touch in the workspace is handled here
// instead of natively, because the renderer canvas blocks touch scrolling:
// two fingers pinch to zoom and drag to pan, and one finger pans from the
// area around the content or a [data-pan-surface] layer. One finger on the
// content goes to it unchanged. A trackpad pinch (ctrl + wheel) zooms around
// the pointer. A gesture reports its final zoom with a zoom-change event.
export class ZoomViewportElement extends HTMLElement {
  static observedAttributes = ["zoom", "gestures"];

  constructor() {
    super();
    this.zoom = 1;
    this.touches = new Map();
    this.ownedPointers = new Set();
    this.syntheticEvents = new WeakSet();
    const capture = { capture: true };
    this.addEventListener(
      "pointerdown",
      (event) => this.handlePointerDown(event),
      capture,
    );
    this.addEventListener(
      "pointermove",
      (event) => this.handlePointerMove(event),
      capture,
    );
    this.addEventListener(
      "pointerup",
      (event) => this.handlePointerEnd(event),
      capture,
    );
    this.addEventListener(
      "pointercancel",
      (event) => this.handlePointerEnd(event),
      capture,
    );
    this.addEventListener("click", (event) => this.handleClick(event), capture);
    this.addEventListener("wheel", (event) => this.handleWheel(event), {
      passive: false,
    });
  }

  connectedCallback() {
    this.style.setProperty("--canvas-zoom", String(this.zoom));
    this.syncTouchAction();
  }

  disconnectedCallback() {
    clearTimeout(this.wheelTimer);
    this.resetGestures();
  }

  attributeChangedCallback(name) {
    if (name === "gestures") {
      this.syncTouchAction();
      this.resetGestures();
      return;
    }

    const zoom = clampZoom(Number(this.getAttribute("zoom") ?? 1) || 1);
    if (zoom === this.zoom) return;
    if (this.isConnected) {
      this.zoomAround(zoom, this.getViewportCenter());
    } else {
      this.zoom = zoom;
    }
  }

  get gesturesEnabled() {
    return this.hasAttribute("gestures");
  }

  syncTouchAction() {
    this.style.touchAction = this.gesturesEnabled ? "none" : "";
  }

  resetGestures() {
    this.touches.clear();
    this.ownedPointers.clear();
    this.pinch = undefined;
    this.pan = undefined;
  }

  getViewportCenter() {
    const bounds = this.getBoundingClientRect();
    return {
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    };
  }

  // Where `point` falls across the content, as fractions of its size.
  getContentFraction(point) {
    const content = this.firstElementChild?.getBoundingClientRect();
    if (!content?.width || !content?.height) return { x: 0.5, y: 0.5 };
    return {
      x: (point.x - content.left) / content.width,
      y: (point.y - content.top) / content.height,
    };
  }

  // Scroll so the content point at `fraction` sits under `point`.
  placeContentFraction(fraction, point) {
    const content = this.firstElementChild?.getBoundingClientRect();
    if (!content) return;
    this.scrollLeft += content.left + fraction.x * content.width - point.x;
    this.scrollTop += content.top + fraction.y * content.height - point.y;
  }

  setZoom(zoom) {
    this.zoom = zoom;
    this.style.setProperty("--canvas-zoom", String(zoom));
  }

  zoomAround(zoom, point) {
    const fraction = this.getContentFraction(point);
    this.setZoom(zoom);
    this.placeContentFraction(fraction, point);
  }

  reportZoom() {
    this.dispatchEvent(
      new CustomEvent("zoom-change", {
        bubbles: true,
        detail: { zoom: this.zoom },
      }),
    );
  }

  isGestureEvent(event) {
    return (
      this.gesturesEnabled &&
      event.pointerType === "touch" &&
      !this.syntheticEvents.has(event)
    );
  }

  swallow(event) {
    event.stopPropagation();
    if (event.cancelable) event.preventDefault();
  }

  handlePointerDown(event) {
    if (!this.isGestureEvent(event)) return;
    this.touches.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      // The innermost target, inside any shadow root, so a cancel reaches the
      // listener that took this finger's pointerdown.
      target: event.composedPath()[0],
    });

    if (this.pinch || this.touches.size > 2) {
      this.ownedPointers.add(event.pointerId);
      this.swallow(event);
      return;
    }

    if (this.touches.size === 2) {
      this.startPinch();
      this.swallow(event);
      return;
    }

    this.suppressClick = false;
    if (event.target === this || event.target.closest?.("[data-pan-surface]")) {
      this.pan = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        distance: 0,
      };
      this.ownedPointers.add(event.pointerId);
    }
  }

  startPinch() {
    const ids = [...this.touches.keys()];
    // The first finger may have started a tap or drag on the content. Cancel
    // it the way the browser would, so the content drops that gesture.
    const [firstId] = ids;
    if (!this.ownedPointers.has(firstId)) {
      const cancel = new PointerEvent("pointercancel", {
        bubbles: true,
        composed: true,
        pointerId: firstId,
        pointerType: "touch",
        isPrimary: true,
      });
      this.syntheticEvents.add(cancel);
      this.touches.get(firstId).target.dispatchEvent(cancel);
    }

    for (const id of ids) this.ownedPointers.add(id);
    this.pan = undefined;
    const [a, b] = ids.map((id) => this.touches.get(id));
    this.pinch = {
      ids,
      startZoom: this.zoom,
      startDistance: Math.max(getDistance(a, b), 1),
      fraction: this.getContentFraction(getMidpoint(a, b)),
    };
  }

  handlePointerMove(event) {
    if (!this.isGestureEvent(event)) return;
    const touch = this.touches.get(event.pointerId);
    if (!touch) return;
    touch.x = event.clientX;
    touch.y = event.clientY;
    if (!this.ownedPointers.has(event.pointerId)) return;
    this.swallow(event);

    if (this.pinch?.ids.includes(event.pointerId)) {
      const [a, b] = this.pinch.ids.map((id) => this.touches.get(id));
      this.setZoom(
        clampZoom(
          (this.pinch.startZoom * getDistance(a, b)) / this.pinch.startDistance,
        ),
      );
      // Keeping the pinched point under the fingers also pans with them.
      this.placeContentFraction(this.pinch.fraction, getMidpoint(a, b));
      return;
    }

    if (this.pan?.pointerId === event.pointerId) {
      const dx = event.clientX - this.pan.x;
      const dy = event.clientY - this.pan.y;
      this.pan.x = event.clientX;
      this.pan.y = event.clientY;
      this.pan.distance += Math.hypot(dx, dy);
      if (this.pan.distance > CLICK_SLOP_PX) this.suppressClick = true;
      this.scrollLeft -= dx;
      this.scrollTop -= dy;
    }
  }

  handlePointerEnd(event) {
    if (!this.isGestureEvent(event)) return;
    if (!this.touches.delete(event.pointerId)) return;
    if (!this.ownedPointers.delete(event.pointerId)) return;
    this.swallow(event);

    if (this.pinch?.ids.includes(event.pointerId)) {
      // The other finger stays owned until it lifts, so it cannot start an
      // edit halfway through.
      this.pinch = undefined;
      this.suppressClick = true;
      this.reportZoom();
    }
    if (this.pan?.pointerId === event.pointerId) {
      this.pan = undefined;
    }
  }

  handleClick(event) {
    if (!this.suppressClick) return;
    this.suppressClick = false;
    event.stopPropagation();
    event.preventDefault();
  }

  handleWheel(event) {
    if (!this.gesturesEnabled || !event.ctrlKey) return;
    event.preventDefault();
    this.zoomAround(
      clampZoom(this.zoom * Math.exp(-event.deltaY * WHEEL_ZOOM_RATE)),
      { x: event.clientX, y: event.clientY },
    );
    clearTimeout(this.wheelTimer);
    this.wheelTimer = setTimeout(() => this.reportZoom(), WHEEL_ZOOM_SETTLE_MS);
  }
}
