import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFullscreenEscapeClient } from "../../src/deps/clients/tauri/fullscreenEscape.js";

const cleanups = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const createHarness = ({ fullscreen = true, customChrome = false } = {}) => {
  const dom = new JSDOM(
    "<body><input><dialog open><button>Close</button></dialog></body>",
  );
  const target = dom.window;
  if (customChrome)
    target.__TAURI__ = { window: { getCurrentWindow: () => {} } };
  let time = 0;
  const appWindow = {
    isFullscreen: vi.fn(async () => fullscreen),
    setFullscreen: vi.fn(async (value) => {
      fullscreen = value;
    }),
  };
  const onArmed = vi.fn();
  const onError = vi.fn();
  const cleanup = createFullscreenEscapeClient({
    appWindow,
    target,
    now: () => time,
  }).subscribe({ onArmed, onError });
  cleanups.push(() => {
    cleanup();
    dom.window.close();
  });
  return {
    target,
    appWindow,
    onArmed,
    onError,
    cleanup,
    advance: (milliseconds) => {
      time += milliseconds;
    },
    press(key = "Escape", options = {}, node = target.document.body) {
      const event = new target.KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        composed: true,
        ...options,
      });
      node.dispatchEvent(event);
      return event;
    },
  };
};

describe("native window fullscreen Escape confirmation", () => {
  it("prevents the native default immediately and exits only on a second press", async () => {
    const h = createHarness();
    expect(h.press().defaultPrevented).toBe(true);
    await settle();
    expect(h.onArmed).toHaveBeenCalledOnce();
    expect(h.appWindow.setFullscreen).not.toHaveBeenCalled();
    h.advance(500);
    h.press();
    await settle();
    expect(h.appWindow.setFullscreen).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("does not count held-key repeats as the second press", async () => {
    const h = createHarness();
    h.press();
    await settle();
    for (let index = 0; index < 5; index += 1)
      h.press("Escape", { repeat: true });
    await settle();
    expect(h.appWindow.setFullscreen).not.toHaveBeenCalled();
    h.press();
    await settle();
    expect(h.appWindow.setFullscreen).toHaveBeenCalledOnce();
  });

  it.each([
    "timeout",
    "typing",
    "pointerdown",
    "blur",
    "resize",
    "consumed",
    "stopped",
    "dialog",
    "composition",
  ])("requires a new pair after %s", async (interruption) => {
    const h = createHarness();
    h.press();
    await settle();
    if (interruption === "timeout") h.advance(1501);
    else if (interruption === "typing") h.press("a");
    else if (interruption === "consumed" || interruption === "stopped") {
      const input = h.target.document.querySelector("input");
      input.addEventListener(
        "keydown",
        (event) => {
          event.preventDefault();
          if (interruption === "stopped") event.stopPropagation();
        },
        { once: true },
      );
      h.press("Escape", {}, input);
    } else if (interruption === "dialog") {
      const event = h.press(
        "Escape",
        {},
        h.target.document.querySelector("button"),
      );
      expect(event.defaultPrevented).toBe(false);
    } else if (interruption === "composition") {
      const event = h.press("Escape", { isComposing: true });
      expect(event.defaultPrevented).toBe(false);
    } else h.target.dispatchEvent(new h.target.Event(interruption));
    await settle();
    h.press();
    await settle();
    expect(h.appWindow.setFullscreen).not.toHaveBeenCalled();
    h.press();
    await settle();
    expect(h.appWindow.setFullscreen).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("serializes fast presses while native fullscreen queries are pending", async () => {
    const h = createHarness();
    let resolveQuery;
    h.appWindow.isFullscreen.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveQuery = resolve;
        }),
    );
    h.press();
    h.advance(100);
    h.press();
    expect(h.appWindow.setFullscreen).not.toHaveBeenCalled();
    resolveQuery(true);
    await settle();
    expect(h.appWindow.setFullscreen).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("resets a consumed Escape before the next key even within one task", async () => {
    const h = createHarness();
    h.press();
    await settle();
    const input = h.target.document.querySelector("input");
    input.addEventListener(
      "keydown",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
      },
      { once: true },
    );
    h.press("Escape", {}, input);
    h.press();
    await settle();
    expect(h.appWindow.setFullscreen).not.toHaveBeenCalled();
    h.press();
    await settle();
    expect(h.appWindow.setFullscreen).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("does not count an Escape that closes a dialog before window bubbling", async () => {
    const h = createHarness();
    h.press();
    await settle();
    const dialog = h.target.document.querySelector("dialog");
    dialog.addEventListener("keydown", () => dialog.removeAttribute("open"), {
      once: true,
    });
    h.press("Escape", {}, dialog.querySelector("button"));
    await settle();
    h.press();
    await settle();
    expect(h.appWindow.setFullscreen).not.toHaveBeenCalled();
  });

  it.each(["typing", "cleanup"])(
    "cancels a pending native query after %s",
    async (action) => {
      const h = createHarness();
      let resolveQuery;
      h.appWindow.isFullscreen.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveQuery = resolve;
          }),
      );
      h.press();
      if (action === "typing") h.press("a");
      else h.cleanup();
      resolveQuery(true);
      await settle();
      expect(h.onArmed).not.toHaveBeenCalled();
      expect(h.appWindow.setFullscreen).not.toHaveBeenCalled();
    },
  );

  it("leaves a windowed or maximized window unchanged", async () => {
    const h = createHarness({ fullscreen: false });
    h.press();
    h.press();
    await settle();
    expect(h.onArmed).not.toHaveBeenCalled();
    expect(h.appWindow.setFullscreen).not.toHaveBeenCalled();
  });

  it("leaves the existing custom-chrome shortcut as the sole owner", async () => {
    const h = createHarness({ customChrome: true });
    expect(h.press().defaultPrevented).toBe(false);
    await settle();
    expect(h.appWindow.isFullscreen).not.toHaveBeenCalled();
  });

  it("reports a failed exit and requires a new confirmation pair", async () => {
    const h = createHarness();
    h.appWindow.setFullscreen.mockRejectedValueOnce(
      new Error("Native request failed"),
    );
    h.press();
    h.press();
    await settle();
    expect(h.onError).toHaveBeenCalledOnce();
    h.press();
    await settle();
    expect(h.appWindow.setFullscreen).toHaveBeenCalledTimes(1);
    h.press();
    await settle();
    expect(h.appWindow.setFullscreen).toHaveBeenCalledTimes(2);
  });
});
