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
      isPrimary: { value: options.isPrimary ?? true },
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
    pointer("pointerdown", { pointerId: 2, isPrimary: false }, document.body);
    pointer("pointerup", { pointerId: 2, isPrimary: false }, document.body);
    vi.advanceTimersByTime(500);
    expect(activate).not.toHaveBeenCalled();
    pointer("pointerup");
    pointer("pointerdown");
    vi.advanceTimersByTime(500);
    expect(activate).toHaveBeenCalledOnce();
  });

  it("does not recognize a non-primary finger on the card", () => {
    pointer("pointerdown", { pointerId: 2, isPrimary: false });
    vi.advanceTimersByTime(500);
    expect(activate).not.toHaveBeenCalled();
    pointer("pointerup", { pointerId: 2, isPrimary: false });
  });

  it("cancels the primary hold when a second finger lands on the same card", () => {
    pointer("pointerdown");
    vi.advanceTimersByTime(250);
    pointer("pointerdown", { pointerId: 2, isPrimary: false });
    vi.advanceTimersByTime(500);
    expect(activate).not.toHaveBeenCalled();
    pointer("pointerup", { pointerId: 2, isPrimary: false });
    pointer("pointerup");
    expect(tapClick().defaultPrevented).toBe(false);
    expect(click).toHaveBeenCalledOnce();
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

  it("does not emit contextmenu for unmarked holds outside iOS", () => {
    const plain = document.createElement("div");
    const menu = vi.fn();
    plain.addEventListener("contextmenu", menu);
    document.body.append(plain);
    pointer("pointerdown", {}, plain);
    vi.advanceTimersByTime(500);
    expect(menu).not.toHaveBeenCalled();
  });
});

describe("iOS touch contextmenu emulation", () => {
  let dom;
  let document;
  let cleanup;
  let row;
  let card;
  let editor;
  let line;
  let menu;
  let menus;
  let click;

  const pointer = (type, options = {}, target = row) => {
    const event = new dom.window.MouseEvent(type, {
      bubbles: true,
      composed: true,
      cancelable: true,
      clientX: 30,
      clientY: 40,
      ...options,
    });
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      pointerType: { value: "touch" },
      isPrimary: { value: true },
    });
    target.dispatchEvent(event);
    return event;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    dom = new JSDOM("<body><div id='component'></div></body>");
    const { window } = dom;
    Object.defineProperty(window.navigator, "userAgent", {
      value:
        "Mozilla/5.0 (iPad; CPU OS 18_7 like Mac OS X) AppleWebKit/605.1.15",
    });
    window.PointerEvent = class extends window.MouseEvent {
      constructor(type, init = {}) {
        super(type, init);
        this.pointerId = init.pointerId;
        this.pointerType = init.pointerType;
        this.isPrimary = init.isPrimary;
      }
    };
    document = window.document;
    const root = document
      .getElementById("component")
      .attachShadow({ mode: "open" });
    root.innerHTML = `
      <div id="row"><span>Character One</span></div>
      <div id="card" data-long-press="true"><span>Resource One</span></div>
      <div id="editor" contenteditable="true"><p>Line One</p></div>`;
    row = root.getElementById("row").firstElementChild;
    card = root.getElementById("card");
    editor = root.getElementById("editor");
    line = editor.firstElementChild;
    menus = [];
    // composedPath() is only populated while the event is dispatching.
    menu = vi.fn((event) => {
      menus.push({
        target: event.composedPath()[0],
        clientX: event.clientX,
        clientY: event.clientY,
        pointerType: event.pointerType,
        button: event.button,
      });
      event.preventDefault();
    });
    click = vi.fn();
    root.addEventListener("contextmenu", menu);
    root.addEventListener("click", click);
    cleanup = installLongPress(document);
  });

  afterEach(() => {
    cleanup();
    dom.window.close();
    vi.useRealTimers();
  });

  it("emits the touch contextmenu Android sends natively", () => {
    pointer("pointerdown");
    vi.advanceTimersByTime(499);
    expect(menu).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(menus).toEqual([
      {
        target: row,
        clientX: 30,
        clientY: 40,
        pointerType: "touch",
        button: 2,
      },
    ]);
  });

  it("suppresses the release click only after a handled menu", () => {
    pointer("pointerdown");
    vi.advanceTimersByTime(500);
    pointer("pointerup");
    expect(pointer("click", { detail: 1 }).defaultPrevented).toBe(true);
    expect(click).not.toHaveBeenCalled();

    menu.mockImplementation(() => {});
    click.mockClear();
    pointer("pointerdown");
    vi.advanceTimersByTime(500);
    pointer("pointerup");
    expect(pointer("click", { detail: 1 }).defaultPrevented).toBe(false);
    expect(click).toHaveBeenCalledOnce();
  });

  it("keeps long-press for opted-in cards instead of emitting contextmenu", () => {
    const activate = vi.fn();
    card.addEventListener("long-press", activate);
    pointer("pointerdown", {}, card.firstElementChild);
    vi.advanceTimersByTime(500);
    expect(activate).toHaveBeenCalledOnce();
    expect(menu).not.toHaveBeenCalled();
  });

  it("leaves editable text native unless the editor opts in to menu holds", () => {
    pointer("pointerdown", {}, line);
    vi.advanceTimersByTime(500);
    pointer("pointerup", {}, line);
    expect(menu).not.toHaveBeenCalled();

    editor.dataset.longPressMenu = "true";
    pointer("pointerdown", {}, line);
    vi.advanceTimersByTime(500);
    expect(menus.map(({ target }) => target)).toEqual([line]);
  });
});
