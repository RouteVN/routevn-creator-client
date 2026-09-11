import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installLongPress } from "../../src/primitives/longPress.js";

describe("delegated long-press gestures", () => {
  let dom;
  let document;
  let card;
  let child;
  let cleanup;
  let activate;
  let click;

  const pointer = (type, options = {}, target = child) => {
    const event = new dom.window.MouseEvent(type, {
      bubbles: true,
      composed: true,
      cancelable: true,
      clientX: 30,
      clientY: 40,
      ...options,
    });
    Object.defineProperties(event, {
      pointerId: { value: options.pointerId ?? 1 },
      pointerType: { value: options.pointerType ?? "touch" },
    });
    target.dispatchEvent(event);
    return event;
  };
  const tapClick = (target = child, detail = 1) =>
    pointer("click", { detail }, target);

  beforeEach(() => {
    vi.useFakeTimers();
    dom = new JSDOM("<body><div id='component'></div></body>");
    document = dom.window.document;
    const root = document
      .getElementById("component")
      .attachShadow({ mode: "open" });
    root.innerHTML =
      '<div data-long-press="true"><div id="preview"></div></div>';
    card = root.firstElementChild;
    child = card.firstElementChild.attachShadow({ mode: "open" });
    child.innerHTML = "<span>Resource One</span>";
    child = child.firstElementChild;
    activate = vi.fn();
    click = vi.fn();
    card.addEventListener("long-press", activate);
    card.addEventListener("click", click);
    cleanup = installLongPress(document);
  });

  afterEach(() => {
    cleanup();
    dom.window.close();
    vi.useRealTimers();
  });

  it("fires once after a stationary hold across nested shadow roots without contextmenu", () => {
    pointer("pointerdown");
    vi.advanceTimersByTime(499);
    expect(activate).not.toHaveBeenCalled();
    pointer("pointermove", { clientX: 33, clientY: 43 });
    vi.advanceTimersByTime(1);
    vi.advanceTimersByTime(2000);
    expect(activate).toHaveBeenCalledOnce();
    expect(activate.mock.calls[0][0].detail).toEqual({
      clientX: 30,
      clientY: 40,
      pointerType: "touch",
    });
  });

  it("preserves a short tap", () => {
    pointer("pointerdown");
    vi.advanceTimersByTime(100);
    pointer("pointerup");
    tapClick();
    vi.advanceTimersByTime(500);
    expect(activate).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledOnce();
  });

  it.each(["pointerup", "pointercancel"])(
    "cancels on %s before the threshold",
    (type) => {
      pointer("pointerdown");
      pointer(type);
      vi.advanceTimersByTime(500);
      expect(activate).not.toHaveBeenCalled();
    },
  );

  it("allows native scrolling and cancels when the finger moves", () => {
    expect(pointer("pointerdown").defaultPrevented).toBe(false);
    expect(pointer("pointermove", { clientY: 60 }).defaultPrevented).toBe(
      false,
    );
    vi.advanceTimersByTime(500);
    expect(activate).not.toHaveBeenCalled();
  });

  it("cancels when a second finger lands outside the card", () => {
    pointer("pointerdown");
    pointer("pointerdown", { pointerId: 2 }, document.body);
    pointer("pointerup", { pointerId: 2 }, document.body);
    vi.advanceTimersByTime(500);
    expect(activate).not.toHaveBeenCalled();
    pointer("pointerup");
    pointer("pointerdown");
    vi.advanceTimersByTime(500);
    expect(activate).toHaveBeenCalledOnce();
  });

  it("suppresses the release click but allows the next intentional tap", () => {
    pointer("pointerdown");
    vi.advanceTimersByTime(500);
    pointer("pointerup");
    expect(tapClick().defaultPrevented).toBe(true);
    expect(click).not.toHaveBeenCalled();
    pointer("pointerdown");
    pointer("pointerup");
    tapClick();
    expect(click).toHaveBeenCalledOnce();
  });

  it("suppresses a release click on an overlay that replaced the pressed card", () => {
    pointer("pointerdown");
    vi.advanceTimersByTime(500);
    card.remove();
    const overlay = document.createElement("button");
    const onOverlayClick = vi.fn();
    overlay.addEventListener("click", onOverlayClick);
    document.body.append(overlay);
    pointer("pointerup", {}, overlay);
    expect(tapClick(overlay).defaultPrevented).toBe(true);
    expect(onOverlayClick).not.toHaveBeenCalled();
  });

  it("suppresses native touch contextmenus before and after recognition", () => {
    const nativeMenu = vi.fn();
    card.addEventListener("contextmenu", nativeMenu);
    pointer("pointerdown");
    expect(pointer("contextmenu").defaultPrevented).toBe(true);
    vi.advanceTimersByTime(500);
    pointer("pointerup");
    expect(pointer("contextmenu").defaultPrevented).toBe(true);
    expect(nativeMenu).not.toHaveBeenCalled();
    expect(activate).toHaveBeenCalledOnce();
  });

  it("preserves real mouse contextmenus even after touching a card", () => {
    pointer("pointerdown");
    pointer("pointerup");
    pointer("pointerdown", { pointerType: "mouse", button: 2 });
    expect(
      pointer("contextmenu", { pointerType: "mouse", button: 2 })
        .defaultPrevented,
    ).toBe(false);
    vi.advanceTimersByTime(500);
    expect(activate).not.toHaveBeenCalled();
  });

  it("suppresses a compatibility mouse contextmenu after a prolonged touch hold", () => {
    pointer("pointerdown");
    vi.advanceTimersByTime(2000);
    pointer("pointerup");
    const event = new dom.window.MouseEvent("contextmenu", {
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    card.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(activate).toHaveBeenCalledOnce();
  });

  it("preserves keyboard activation", () => {
    pointer("pointerdown");
    vi.advanceTimersByTime(500);
    expect(tapClick(child, 0).defaultPrevented).toBe(false);
    expect(click).toHaveBeenCalledOnce();
  });

  it.each(["remove", "disable", "scroll"])(
    "does not activate a card after %s",
    (change) => {
      pointer("pointerdown");
      if (change === "remove") card.remove();
      if (change === "disable") card.dataset.longPress = "false";
      if (change === "scroll")
        card.getBoundingClientRect = () => ({ top: -50, left: 0 });
      vi.advanceTimersByTime(500);
      expect(activate).not.toHaveBeenCalled();
    },
  );

  it("leaves nested controls and unmarked surfaces alone", () => {
    const button = document.createElement("button");
    card.append(button);
    pointer("pointerdown", {}, button);
    vi.advanceTimersByTime(500);
    expect(activate).not.toHaveBeenCalled();
    pointer("pointerup", {}, button);
    card.dataset.longPress = "false";
    pointer("pointerdown");
    vi.advanceTimersByTime(500);
    expect(activate).not.toHaveBeenCalled();
  });

  it("installs once and cleans up pending recognition and listeners", () => {
    expect(installLongPress(document)).toBe(cleanup);
    pointer("pointerdown");
    cleanup();
    vi.advanceTimersByTime(500);
    pointer("pointerdown");
    vi.advanceTimersByTime(500);
    expect(activate).not.toHaveBeenCalled();
  });
});
