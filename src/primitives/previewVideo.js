export const PREVIEW_VIDEO_TAG_NAME = "rvn-preview-video";

// A video holds its last frame this long before it plays again.
export const PREVIEW_VIDEO_LOOP_GAP_MS = 500;
// WebKit (macOS and iOS) can stop a WebM video at or near its end while still
// reporting it as playing, without an ended event. A video still on a frame
// near its end this many frame durations after showing it has ended, and so
// has any playing video whose time has not moved for PREVIEW_VIDEO_STALL_MS.
export const PREVIEW_VIDEO_END_HOLD_FRAMES = 1;
export const PREVIEW_VIDEO_STALL_MS = 150;
export const PREVIEW_VIDEO_STALL_CHECK_MS = 50;

const HAVE_CURRENT_DATA = 2;
const MIN_FRAME_SECONDS = 1 / 120;
const MAX_FRAME_SECONDS = 1 / 24;
const HOVER_POINTER_TYPES = new Set(["mouse", "pen"]);
// A third of the way through shows a transition under way. Its middle can be
// a blank screen, such as the black middle of a fade through black.
const REST_FRAME_POSITION = 1 / 3;

// The nearest element marked data-preview-hover around the element, across
// shadow roots, or the element itself.
const findHoverTarget = (element) => {
  let node = element;
  while (node) {
    if (node.hasAttribute("data-preview-hover")) return node;
    node = node.parentElement ?? node.getRootNode().host;
  }
  return element;
};

// A muted preview video that loops with a short pause. It plays only while it is on screen and has
// no paused attribute, so previews scrolled away or covered by another view
// stop decoding. With the hover attribute it rests on one frame and plays from
// the start only while a mouse is over its hover target, or the target has
// keyboard focus.
export class PreviewVideoElement extends HTMLElement {
  static observedAttributes = ["src", "label", "paused", "hover"];

  constructor() {
    super();
    this.onScreen = false;
    this.hoverTarget = undefined;
    this.pointerOver = false;
    this.keyboardFocus = false;
    this.stallTimer = undefined;
    this.endTimer = undefined;
    this.loopTimer = undefined;
    this.frameRequest = undefined;
    this.lastTime = undefined;
    this.lastProgressAt = 0;
    this.lastMediaTime = undefined;
    this.attachShadow({ mode: "open" });
    this.video = document.createElement("video");
    this.video.defaultMuted = true;
    this.video.muted = true;
    this.video.loop = false;
    this.video.playsInline = true;
    this.video.preload = "auto";
    this.video.style.cssText =
      "display: block; width: 100%; height: 100%; object-fit: contain; background: #000;";
    this.video.addEventListener("canplay", () => this.syncPlayback());
    this.video.addEventListener("ended", () => this.endLoop());
    this.video.addEventListener("durationchange", () => {
      if (this.hasAttribute("hover") && !this.shouldPlay()) {
        this.showRestFrame();
      }
    });
    this.shadowRoot.append(this.video);
    this.handlePointerEnter = (event) => {
      if (!HOVER_POINTER_TYPES.has(event.pointerType)) return;
      this.pointerOver = true;
      this.syncPlayback();
    };
    this.handlePointerLeave = () => {
      this.pointerOver = false;
      this.syncPlayback();
    };
    this.handleFocusIn = () => {
      this.keyboardFocus = this.hoverTarget.matches(":focus-visible");
      this.syncPlayback();
    };
    this.handleFocusOut = () => {
      this.keyboardFocus = false;
      this.syncPlayback();
    };
    if (typeof IntersectionObserver === "function") {
      this.intersectionObserver = new IntersectionObserver((entries) => {
        this.onScreen = entries.at(-1).isIntersecting;
        this.syncPlayback();
      });
    }
  }

  connectedCallback() {
    this.style.display = "block";
    this.style.width = "100%";
    this.style.height = "100%";
    this.syncSource();
    this.syncHoverTarget();
    if (this.intersectionObserver) {
      this.intersectionObserver.observe(this);
    } else {
      this.onScreen = true;
    }
    this.syncPlayback();
  }

  disconnectedCallback() {
    this.intersectionObserver?.disconnect();
    this.onScreen = false;
    this.syncHoverTarget();
    this.syncPlayback();
    // Releases the decoder; the owner may revoke the source URL next.
    this.video.removeAttribute("src");
    this.video.load();
  }

  attributeChangedCallback(name) {
    if (name === "label") {
      this.video.setAttribute("aria-label", this.getAttribute("label") ?? "");
      return;
    }
    if (name === "src" && this.isConnected) {
      this.syncSource();
    }
    if (name === "hover") {
      this.syncHoverTarget();
    }
    this.syncPlayback();
  }

  syncHoverTarget() {
    const hoverTarget =
      this.isConnected && this.hasAttribute("hover")
        ? findHoverTarget(this)
        : undefined;
    if (hoverTarget === this.hoverTarget) return;
    if (this.hoverTarget) {
      this.hoverTarget.removeEventListener(
        "pointerenter",
        this.handlePointerEnter,
      );
      this.hoverTarget.removeEventListener(
        "pointerleave",
        this.handlePointerLeave,
      );
      this.hoverTarget.removeEventListener("focusin", this.handleFocusIn);
      this.hoverTarget.removeEventListener("focusout", this.handleFocusOut);
    }
    this.hoverTarget = hoverTarget;
    this.pointerOver = false;
    this.keyboardFocus = false;
    if (!hoverTarget) return;
    hoverTarget.addEventListener("pointerenter", this.handlePointerEnter);
    hoverTarget.addEventListener("pointerleave", this.handlePointerLeave);
    hoverTarget.addEventListener("focusin", this.handleFocusIn);
    hoverTarget.addEventListener("focusout", this.handleFocusOut);
  }

  syncSource() {
    const src = this.getAttribute("src");
    if (this.video.getAttribute("src") === src) return;
    if (src) {
      this.video.setAttribute("src", src);
    } else {
      this.video.removeAttribute("src");
    }
  }

  shouldPlay() {
    return (
      this.isConnected &&
      this.onScreen &&
      !this.hasAttribute("paused") &&
      this.video.hasAttribute("src") &&
      (!this.hasAttribute("hover") || this.pointerOver || this.keyboardFocus)
    );
  }

  syncPlayback() {
    const hover = this.hasAttribute("hover");
    if (!this.shouldPlay()) {
      const wasPlaying = !this.video.paused || this.loopTimer !== undefined;
      this.stopWatching();
      clearTimeout(this.loopTimer);
      this.loopTimer = undefined;
      if (!this.video.paused) this.video.pause();
      if (hover && wasPlaying) this.showRestFrame();
      return;
    }
    if (this.loopTimer !== undefined) return;
    if (hover && this.video.paused) this.video.currentTime = 0;
    this.play();
    this.startWatching();
  }

  // Holds the last frame for PREVIEW_VIDEO_LOOP_GAP_MS, then plays again from
  // the start.
  endLoop() {
    if (this.loopTimer !== undefined || !this.shouldPlay()) return;
    this.stopWatching();
    if (!this.video.paused) this.video.pause();
    this.loopTimer = setTimeout(() => {
      this.loopTimer = undefined;
      this.video.currentTime = 0;
      this.syncPlayback();
    }, PREVIEW_VIDEO_LOOP_GAP_MS);
  }

  showRestFrame() {
    const { duration } = this.video;
    if (Number.isNaN(duration)) return;
    // A recorded WebM may not state its duration; seeking past its end makes
    // the browser find it and report it with a durationchange event.
    this.video.currentTime = Number.isFinite(duration)
      ? duration * REST_FRAME_POSITION
      : Number.MAX_SAFE_INTEGER;
  }

  play() {
    try {
      this.video.play()?.catch(() => undefined);
    } catch {
      // A later canplay event tries again when the media is ready.
    }
  }

  startWatching() {
    if (this.stallTimer !== undefined) return;
    this.lastTime = undefined;
    this.lastMediaTime = undefined;
    this.stallTimer = setInterval(
      () => this.checkStall(),
      PREVIEW_VIDEO_STALL_CHECK_MS,
    );
    this.requestFrame();
  }

  stopWatching() {
    clearInterval(this.stallTimer);
    clearTimeout(this.endTimer);
    this.stallTimer = undefined;
    this.endTimer = undefined;
    if (this.frameRequest !== undefined) {
      this.video.cancelVideoFrameCallback(this.frameRequest);
      this.frameRequest = undefined;
    }
  }

  requestFrame() {
    if (typeof this.video.requestVideoFrameCallback !== "function") return;
    this.frameRequest = this.video.requestVideoFrameCallback(
      (_now, { mediaTime }) => this.handleFrame(mediaTime),
    );
  }

  // Each frame near the end arms an end that the next frame cancels, so only
  // a video held on its last frame ends.
  handleFrame(mediaTime) {
    const { video } = this;
    const frameSeconds = Math.min(
      Math.max(mediaTime - (this.lastMediaTime ?? 0), MIN_FRAME_SECONDS),
      MAX_FRAME_SECONDS,
    );
    this.lastMediaTime = mediaTime;
    clearTimeout(this.endTimer);
    this.endTimer = undefined;
    if (mediaTime + frameSeconds * 3 >= video.duration) {
      this.endTimer = setTimeout(
        () => {
          this.endTimer = undefined;
          if (
            !video.paused &&
            !video.seeking &&
            video.currentTime >= mediaTime
          ) {
            this.endLoop();
          }
        },
        frameSeconds * PREVIEW_VIDEO_END_HOLD_FRAMES * 1000,
      );
    }
    this.requestFrame();
  }

  checkStall() {
    const { video } = this;
    const now = performance.now();
    if (
      video.paused ||
      video.seeking ||
      video.readyState < HAVE_CURRENT_DATA ||
      document.hidden ||
      video.currentTime !== this.lastTime
    ) {
      this.lastTime = video.currentTime;
      this.lastProgressAt = now;
      return;
    }
    if (now - this.lastProgressAt < PREVIEW_VIDEO_STALL_MS) return;
    this.endLoop();
  }
}
