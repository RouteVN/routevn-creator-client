// Owns the pointer surface and coordinate conversion, not animation persistence.
export class CameraViewportElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; width:100%; height:100%; min-height:240px; outline:none; }
        #surface { width:100%; height:100%; position:relative; overflow:hidden; touch-action:none;
          background-image:radial-gradient(circle,var(--input) 1px,transparent 1px); background-size:24px 24px; cursor:grab; }
        #frame { position:absolute; background:#111; box-shadow:0 0 0 1px var(--border); overflow:hidden; }
        #content { position:absolute; transform-origin:center; background-color:#d8d8d8;
          background-image:linear-gradient(#b9b9b9 1px,transparent 1px),linear-gradient(90deg,#b9b9b9 1px,transparent 1px);
          background-size:10% 10%; box-shadow:0 0 0 1px var(--ring); }
        :host(:focus-visible) #frame { outline:2px solid var(--ring); outline-offset:4px; }
        ::slotted(*) { display:block; width:100%; height:100%; pointer-events:none; }
      </style>
      <div id="surface"><div id="frame"><div id="content"><slot></slot></div></div></div>`;
    this.surface = this.shadowRoot.getElementById("surface");
    this.frame = this.shadowRoot.getElementById("frame");
    this.content = this.shadowRoot.getElementById("content");
    this.surface.addEventListener("pointerdown", (event) =>
      this.startDrag(event),
    );
    this.surface.addEventListener("pointermove", (event) =>
      this.moveDrag(event),
    );
    this.surface.addEventListener("pointerup", (event) => this.endDrag(event));
    this.surface.addEventListener("pointercancel", (event) =>
      this.endDrag(event, true),
    );
    this.surface.addEventListener("lostpointercapture", () => {
      this.drag = undefined;
      this.surface.style.cursor = "grab";
    });
    this.surface.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        if (!this.drag) this.zoom(Math.exp(-event.deltaY * 0.001));
      },
      { passive: false },
    );
    this.addEventListener("keydown", (event) => this.handleKeyDown(event));
    this.observer = new ResizeObserver(() => this.paint());
  }

  connectedCallback() {
    this.observer.observe(this);
    this.paint();
  }

  disconnectedCallback() {
    this.observer.disconnect();
    this.drag = undefined;
  }

  set pose(value) {
    this.currentPose = value;
    this.paint();
  }
  get pose() {
    return this.currentPose;
  }
  set resolution(value) {
    this.projectResolution = value;
    this.paint();
  }
  set imageSize(value) {
    this.contentSize = value;
    this.paint();
  }

  paint() {
    if (!this.currentPose || !this.projectResolution || !this.isConnected)
      return;
    const { width, height } = this.projectResolution;
    this.ratio = Math.max(
      0.001,
      Math.min(
        (this.clientWidth - 48) / width,
        (this.clientHeight - 48) / height,
      ),
    );
    const frameWidth = width * this.ratio;
    const frameHeight = height * this.ratio;
    Object.assign(this.frame.style, {
      width: `${frameWidth}px`,
      height: `${frameHeight}px`,
      left: `${(this.clientWidth - frameWidth) / 2}px`,
      top: `${(this.clientHeight - frameHeight) / 2}px`,
    });
    const pose = this.currentPose;
    const size = this.contentSize ?? this.projectResolution;
    Object.assign(this.content.style, {
      left: `${pose.x * this.ratio}px`,
      top: `${pose.y * this.ratio}px`,
      width: `${size.width * this.ratio}px`,
      height: `${size.height * this.ratio}px`,
      transform: `translate(-50%, -50%) scale(${pose.scaleX}, ${pose.scaleY})`,
    });
  }

  changePose(pose) {
    this.currentPose = pose;
    this.paint();
    this.dispatchEvent(
      new CustomEvent("pose-change", {
        detail: { pose },
        bubbles: true,
        composed: true,
      }),
    );
  }

  startDrag(event) {
    if (event.button !== 0 || this.drag || !this.currentPose) return;
    this.focus({ preventScroll: true });
    this.drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      ratio: this.ratio,
      pose: { ...this.currentPose },
    };
    this.surface.setPointerCapture(event.pointerId);
    this.surface.style.cursor = "grabbing";
  }

  moveDrag(event) {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    this.changePose({
      ...drag.pose,
      x: drag.pose.x + (event.clientX - drag.x) / drag.ratio,
      y: drag.pose.y + (event.clientY - drag.y) / drag.ratio,
    });
  }

  endDrag(event, cancelled = false) {
    if (this.drag?.pointerId !== event.pointerId) return;
    if (cancelled) this.changePose(this.drag.pose);
    else this.moveDrag(event);
    this.drag = undefined;
    this.surface.releasePointerCapture(event.pointerId);
    this.surface.style.cursor = "grab";
  }

  zoom(factor) {
    const pose = this.currentPose;
    if (!pose || this.drag) return;
    const boundedFactor = Math.max(
      0.1 / Math.min(pose.scaleX, pose.scaleY),
      Math.min(factor, 10 / Math.max(pose.scaleX, pose.scaleY)),
    );
    this.changePose({
      ...pose,
      scaleX: pose.scaleX * boundedFactor,
      scaleY: pose.scaleY * boundedFactor,
    });
  }

  reset() {
    const { width, height } = this.projectResolution;
    this.changePose({ x: width / 2, y: height / 2, scaleX: 1, scaleY: 1 });
  }

  handleKeyDown(event) {
    const moves = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (event.ctrlKey || event.metaKey || event.altKey || this.drag) return;
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      this.changePose({
        ...this.currentPose,
        x: this.currentPose.x + move[0] * step,
        y: this.currentPose.y + move[1] * step,
      });
    } else if (["+", "=", "-"].includes(event.key)) {
      event.preventDefault();
      this.zoom(event.key === "-" ? 1 / 1.1 : 1.1);
    }
  }
}
