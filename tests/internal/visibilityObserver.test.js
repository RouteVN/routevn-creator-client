import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("visibility observer primitive", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("emits visible once and disconnects its observer", async () => {
    const dom = new JSDOM("<!doctype html><body></body>");
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("CustomEvent", dom.window.CustomEvent);
    let observerCallback;
    const disconnect = vi.fn();
    const observe = vi.fn();
    const IntersectionObserver = vi.fn((callback) => {
      observerCallback = callback;
      return { disconnect, observe };
    });
    vi.stubGlobal("IntersectionObserver", IntersectionObserver);
    const { VisibilityObserverElement, VISIBILITY_OBSERVER_TAG_NAME } =
      await import("../../src/primitives/visibilityObserver.js");
    dom.window.customElements.define(
      VISIBILITY_OBSERVER_TAG_NAME,
      VisibilityObserverElement,
    );
    const element = dom.window.document.createElement(
      VISIBILITY_OBSERVER_TAG_NAME,
    );
    const visible = vi.fn();
    element.addEventListener("visible", visible);

    dom.window.document.body.append(element);
    expect(observe).toHaveBeenCalledWith(element);
    expect(IntersectionObserver).toHaveBeenCalledWith(expect.any(Function), {
      rootMargin: "200px",
      threshold: 0.01,
    });

    observerCallback([{ isIntersecting: true, intersectionRatio: 1 }]);
    observerCallback([{ isIntersecting: true, intersectionRatio: 1 }]);

    expect(visible).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
