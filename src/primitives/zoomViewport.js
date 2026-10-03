export const ZOOM_VIEWPORT_TAG_NAME = "rvn-zoom-viewport";

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 10;
// Movement before a pan or pinch swallows the click that follows it.
const CLICK_SLOP_PX = 4;
const WHEEL_ZOOM_SETTLE_MS = 150;
const WHEEL_ZOOM_RATE = 0.01;
const WHEEL_LINE_PX = 16;
const MIDDLE_BUTTON = 1;

const clampZoom = (zoom) =>
  Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) * 100) / 100;

const getDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const getMidpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// Owns a canvas workspace: the zoom of its content and, with the gestures
// attribute, where the content sits. The content sizes itself from the
// --canvas-zoom variable and, in that mode, places itself at --canvas-x and
// --canvas-y from the workspace's top-left corner. The zoom attribute sets
// the zoom, and centerContent() moves the content back to the middle.
//
// With gestures, the content moves freely, as on a design tool canvas, and
// input in the workspace is handled here, because the renderer canvas blocks
// native touch scrolling:
// - Two fingers pinch to zoom around the point between them and drag to pan.
// - One finger, a pen, or the left mouse button pans from the space around
//   the content; on the content it reaches the content unchanged. The middle
//   mouse button pans anywhere.
// - The wheel pans, and ctrl + wheel (a trackpad pinch) zooms around the
//   pointer.
// A gesture reports its final zoom with a zoom-change event. Until one moves
// the content, it stays centered while the workspace or content resizes.
export class ZoomViewportElement extends HTMLElement {
  static observedAttributes = ["zoom", "gestures"];

  constructor() {
    super();
    this.zoom = 1;
    this.x = 0;
    this.y = 0;
    this.centered = true;
    this.touches = new Map();
    this.ownedPointers = new Set();
    this.syntheticEvents = new WeakSet();
    // The owner sets the inline style, so keep these variables out of it.
    this.attachShadow({ mode: "open" });
    this.hostStyle = document.createElement("style");
    this.shadowRoot.append(this.hostStyle, document.createElement("slot"));
    this.syncHostStyle();

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
    this.resizeObserver = new ResizeObserver(() => {
      if (this.centered && this.gesturesEnabled) this.centerContent();
    });
  }

  connectedCallback() {
    this.resizeObserver.observe(this);
    if (this.firstElementChild) {
      this.resizeObserver.observe(this.firstElementChild);
    }
  }

  disconnectedCallback() {
    clearTimeout(this.wheelTimer);
    this.resizeObserver.disconnect();
    this.resetGestures();
  }

  attributeChangedCallback(name) {
    if (name === "gestures") {
      this.resetGestures();
      this.syncHostStyle();
      if (this.isConnected && this.gesturesEnabled) this.centerContent();
      return;
    }

    const zoom = clampZoom(Number(this.getAttribute("zoom") ?? 1) || 1);
    if (zoom === this.zoom) return;
    if (this.isConnected && this.gesturesEnabled) {
      this.zoomAround(zoom, this.getViewportCenter());
    } else {
      this.zoom = zoom;
      this.syncHostStyle();
    }
  }

  get gesturesEnabled() {
    return this.hasAttribute("gestures");
  }

  syncHostStyle() {
    this.hostStyle.textContent = `:host { --canvas-zoom: ${this.zoom}; --canvas-x: ${this.x}px; --canvas-y: ${this.y}px;${this.gesturesEnabled ? " touch-action: none;" : ""} }`;
  }

  resetGestures() {
    this.touches.clear();
    this.ownedPointers.clear();
    this.pinch = undefined;
    this.pan = undefined;
  }

  setView({ zoom = this.zoom, x = this.x, y = this.y }) {
    this.zoom = zoom;
    this.x = x;
    this.y = y;
    this.syncHostStyle();
  }

  centerContent() {
    const content = this.firstElementChild;
    if (!content) return;
    this.centered = true;
    // Layout sizes, which the content's translate does not change.
    this.setView({
      x: (this.clientWidth - content.offsetWidth) / 2,
      y: (this.clientHeight - content.offsetHeight) / 2,
    });
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

  // Move the content so its point at `fraction` sits under `point`.
  placeContentFraction(fraction, point) {
    const content = this.firstElementChild?.getBoundingClientRect();
    if (!content) return;
    this.setView({
      x: this.x + point.x - (content.left + fraction.x * content.width),
      y: this.y + point.y - (content.top + fraction.y * content.height),
    });
  }

  zoomAround(zoom, point) {
    const fraction = this.getContentFraction(point);
    this.setView({ zoom });
    this.placeContentFraction(fraction, point);
  }

  panBy(dx, dy) {
    this.centered = false;
    this.setView({ x: this.x + dx, y: this.y + dy });
  }

  reportZoom() {
    this.dispatchEvent(
      new CustomEvent("zoom-change", {
        bubbles: true,
        detail: { zoom: this.zoom },
      }),
    );
  }

  swallow(event) {
    event.stopPropagation();
    if (event.cancelable) event.preventDefault();
  }

  startPan(event) {
    this.pan = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      distance: 0,
    };
    this.ownedPointers.add(event.pointerId);
  }

  handlePointerDown(event) {
    if (!this.gesturesEnabled || this.syntheticEvents.has(event)) return;
    if (event.pointerType === "touch") {
      this.handleTouchDown(event);
      return;
    }

    const middle = event.button === MIDDLE_BUTTON;
    if (!middle && !(event.button === 0 && event.target === this)) return;
    this.suppressClick = false;
    this.startPan(event);
    // Keep receiving the drag when the pointer leaves the workspace.
    this.setPointerCapture?.(event.pointerId);
    if (middle) this.swallow(event);
  }

  handleTouchDown(event) {
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
    if (event.target === this) this.startPan(event);
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
    this.centered = false;
    const [a, b] = ids.map((id) => this.touches.get(id));
    this.pinch = {
      ids,
      startZoom: this.zoom,
      startDistance: Math.max(getDistance(a, b), 1),
      fraction: this.getContentFraction(getMidpoint(a, b)),
    };
  }

  handlePointerMove(event) {
    if (!this.gesturesEnabled || this.syntheticEvents.has(event)) return;
    const touch = this.touches.get(event.pointerId);
    if (touch) {
      touch.x = event.clientX;
      touch.y = event.clientY;
    }
    if (!this.ownedPointers.has(event.pointerId)) return;
    this.swallow(event);

    if (this.pinch?.ids.includes(event.pointerId)) {
      const [a, b] = this.pinch.ids.map((id) => this.touches.get(id));
      this.setView({
        zoom: clampZoom(
          (this.pinch.startZoom * getDistance(a, b)) / this.pinch.startDistance,
        ),
      });
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
      this.panBy(dx, dy);
    }
  }

  handlePointerEnd(event) {
    if (!this.gesturesEnabled || this.syntheticEvents.has(event)) return;
    this.touches.delete(event.pointerId);
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
      if (this.hasPointerCapture?.(event.pointerId)) {
        this.releasePointerCapture(event.pointerId);
      }
    }
  }

  handleClick(event) {
    if (!this.suppressClick) return;
    this.suppressClick = false;
    event.stopPropagation();
    event.preventDefault();
  }

  handleWheel(event) {
    if (!this.gesturesEnabled) return;
    event.preventDefault();
    const unit =
      event.deltaMode === 1
        ? WHEEL_LINE_PX
        : event.deltaMode === 2
          ? this.clientHeight
          : 1;

    if (event.ctrlKey) {
      this.centered = false;
      this.zoomAround(
        clampZoom(this.zoom * Math.exp(-event.deltaY * unit * WHEEL_ZOOM_RATE)),
        { x: event.clientX, y: event.clientY },
      );
      clearTimeout(this.wheelTimer);
      this.wheelTimer = setTimeout(
        () => this.reportZoom(),
        WHEEL_ZOOM_SETTLE_MS,
      );
      return;
    }

    // Shift turns a vertical mouse wheel into horizontal panning.
    const horizontal = event.shiftKey && event.deltaX === 0;
    this.panBy(
      -(horizontal ? event.deltaY : event.deltaX) * unit,
      -(horizontal ? 0 : event.deltaY) * unit,
    );
  }
}
