export const VISIBILITY_OBSERVER_TAG_NAME = "rvn-visibility-observer";

export class VisibilityObserverElement extends HTMLElement {
  constructor() {
    super();
    this._observer = undefined;
    this._visible = false;
  }

  connectedCallback() {
    this.style.display = "block";
    this.style.width = "100%";
    this.style.height = "100%";

    if (this._visible) return;
    if (typeof IntersectionObserver !== "function") {
      queueMicrotask(() => this.notifyVisible());
      return;
    }

    this._observer = new IntersectionObserver(
      (entries) => {
        if (
          entries.some(
            (entry) => entry.isIntersecting || entry.intersectionRatio > 0,
          )
        ) {
          this.notifyVisible();
        }
      },
      { rootMargin: "200px", threshold: 0.01 },
    );
    this._observer.observe(this);
  }

  disconnectedCallback() {
    this._observer?.disconnect();
    this._observer = undefined;
  }

  notifyVisible() {
    if (this._visible || !this.isConnected) return;
    this._visible = true;
    this._observer?.disconnect();
    this._observer = undefined;
    this.dispatchEvent(new CustomEvent("visible"));
  }
}
