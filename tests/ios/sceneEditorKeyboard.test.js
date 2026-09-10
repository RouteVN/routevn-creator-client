import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installIOSSceneEditorKeyboard } from "../../src/deps/clients/ios/sceneEditorKeyboard.js";

const { callIOSBridge } = vi.hoisted(() => ({ callIOSBridge: vi.fn() }));
vi.mock("../../src/deps/clients/ios/bridge.js", () => ({ callIOSBridge }));

describe("iOS scene editor keyboard", () => {
  let dom;
  let viewport;
  let editable;
  let editor;
  let cleanup;
  let frames;
  let onRevealError;

  beforeEach(() => {
    dom = new JSDOM("<!doctype html><div id='app'></div>");
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    frames = new Map();
    let nextFrameId = 0;
    vi.stubGlobal("requestAnimationFrame", (callback) => {
      frames.set(++nextFrameId, callback);
      return nextFrameId;
    });
    vi.stubGlobal("cancelAnimationFrame", (id) => frames.delete(id));
    viewport = new dom.window.EventTarget();
    viewport.height = window.innerHeight;
    viewport.width = 390;
    viewport.offsetTop = 0;
    viewport.offsetLeft = 0;
    Object.defineProperty(window, "visualViewport", { value: viewport });
    const shadow = document
      .querySelector("#app")
      .attachShadow({ mode: "open" });
    shadow.innerHTML = `<rvn-lexical-scene-document-editor>
      <div contenteditable="true" tabindex="0"><p>Example dialogue</p></div>
      <button>Line number</button>
    </rvn-lexical-scene-document-editor>`;
    editor = shadow.querySelector("rvn-lexical-scene-document-editor");
    editable = editor.querySelector("[contenteditable]");
    Object.defineProperty(editable, "isContentEditable", { value: true });
    editor.revealCurrentSelection = vi.fn(() => true);
    editor.revealSelectionRect = vi.fn();
    callIOSBridge.mockReset().mockResolvedValue(undefined);
    onRevealError = vi.fn();
    cleanup = installIOSSceneEditorKeyboard({ onRevealError });
  });

  afterEach(() => {
    cleanup();
    dom.window.close();
    vi.unstubAllGlobals();
  });

  const flushFrame = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback());
  };

  const mouseDown = (element, button = 0) => {
    const event = new window.MouseEvent("mousedown", {
      bubbles: true,
      composed: true,
      cancelable: true,
      button,
    });
    element.dispatchEvent(event);
    return event;
  };

  const arrow = (key, options = {}) => {
    const event = new window.KeyboardEvent("keydown", {
      key,
      bubbles: true,
      composed: true,
      cancelable: true,
      ...options,
    });
    editable.dispatchEvent(event);
    return event;
  };

  const flushReveal = async () => {
    flushFrame();
    flushFrame();
    await Promise.resolve();
  };

  it("focuses after editor activation without cancelling native caret placement", () => {
    const calls = [];
    editable.addEventListener("mousedown", () => calls.push("activate"), true);
    const focus = vi.spyOn(editable, "focus").mockImplementation((options) => {
      calls.push(options);
    });

    const event = mouseDown(editable.querySelector("p"));

    expect(calls).toEqual(["activate", { preventScroll: true }]);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
  });

  it("preserves gutter, context menu, handled reference, and unrelated input behavior", () => {
    const focus = vi.spyOn(editable, "focus");
    mouseDown(editor.querySelector("button"));
    mouseDown(editable, 2);
    editable.addEventListener("mousedown", (event) => event.preventDefault(), {
      once: true,
    });
    mouseDown(editable);
    const input = document.createElement("input");
    document.body.append(input);
    const inputFocus = vi.spyOn(input, "focus");
    mouseDown(input);

    expect(focus).not.toHaveBeenCalled();
    expect(inputFocus).not.toHaveBeenCalled();
  });

  it("reveals the focused caret after keyboard layout and cancels work on dismissal", () => {
    editable.focus();
    viewport.height = window.innerHeight - 380;
    viewport.dispatchEvent(new window.Event("resize"));
    flushFrame();
    expect(editor.revealCurrentSelection).not.toHaveBeenCalled();
    flushFrame();
    expect(editor.revealCurrentSelection).toHaveBeenCalledExactlyOnceWith({
      behavior: "auto",
      direction: "down",
    });

    viewport.dispatchEvent(new window.Event("resize"));
    flushFrame();
    viewport.height = window.innerHeight;
    viewport.dispatchEvent(new window.Event("resize"));
    flushFrame();
    expect(editor.revealCurrentSelection).toHaveBeenCalledTimes(1);
  });

  it("does not reveal an editor that lost focus, and removes listeners on cleanup", () => {
    editable.focus();
    viewport.height = window.innerHeight - 380;
    viewport.dispatchEvent(new window.Event("resize"));
    editable.blur();
    flushFrame();
    flushFrame();
    expect(editor.revealCurrentSelection).not.toHaveBeenCalled();

    cleanup();
    const focus = vi.spyOn(editable, "focus");
    mouseDown(editable);
    viewport.dispatchEvent(new window.Event("resize"));
    expect(focus).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it.each([
    ["ArrowUp", "up"],
    ["ArrowDown", "down"],
  ])(
    "reveals %s from UIKit when the shadow caret is unavailable",
    async (key, direction) => {
      editable.focus();
      editor.revealCurrentSelection.mockReturnValue(false);
      callIOSBridge.mockResolvedValue({
        x: 80,
        y: 460,
        width: 2,
        height: 20,
        viewWidth: 390,
      });
      const event = arrow(key);
      expect(callIOSBridge).not.toHaveBeenCalled();
      await flushReveal();
      expect(event.defaultPrevented).toBe(false);
      expect(callIOSBridge).toHaveBeenCalledExactlyOnceWith("getCaretRect");
      expect(editor.revealSelectionRect).toHaveBeenCalledWith({
        rect: {
          left: 80,
          top: 460,
          right: 82,
          bottom: 480,
          width: 2,
          height: 20,
        },
        behavior: "auto",
        direction,
      });
    },
  );

  it("uses readable DOM caret geometry without calling the native bridge", async () => {
    editable.focus();
    arrow("ArrowDown");
    await flushReveal();
    expect(editor.revealCurrentSelection).toHaveBeenCalledWith({
      behavior: "auto",
      direction: "down",
    });
    expect(callIOSBridge).not.toHaveBeenCalled();
  });

  it("scales native view coordinates without adding viewport pan again", async () => {
    editable.focus();
    editor.revealCurrentSelection.mockReturnValue(false);
    viewport.width = 195;
    viewport.offsetTop = 40;
    viewport.offsetLeft = 10;
    callIOSBridge.mockResolvedValue({
      x: 80,
      y: 460,
      width: 2,
      height: 20,
      viewWidth: 390,
    });
    arrow("ArrowDown");
    await flushReveal();
    expect(editor.revealSelectionRect).toHaveBeenCalledWith(
      expect.objectContaining({
        rect: {
          left: 40,
          top: 230,
          right: 41,
          bottom: 240,
          width: 1,
          height: 10,
        },
      }),
    );
  });

  it("preserves the native caret position after iOS pans and resizes for the keyboard", async () => {
    editable.focus();
    editor.revealCurrentSelection.mockReturnValue(false);
    Object.defineProperty(window, "innerHeight", { value: 464 });
    viewport.height = 464;
    viewport.offsetTop = 380;
    callIOSBridge.mockResolvedValue({
      x: 96,
      y: -25,
      width: 2,
      height: 21,
      viewWidth: 390,
    });
    arrow("ArrowDown");
    await flushReveal();
    // Measured on iOS 16: this caret is above the dialogue scroller. Adding
    // the 380px pan changes its y to 355 and incorrectly scrolls farther down.
    expect(editor.revealSelectionRect).toHaveBeenCalledWith({
      rect: {
        left: 96,
        top: -25,
        right: 98,
        bottom: -4,
        width: 2,
        height: 21,
      },
      behavior: "auto",
      direction: "down",
    });
  });

  it.each(["next-arrow", "tap", "blur", "cleanup", "dismiss"])(
    "ignores a stale native reply after %s",
    async (action) => {
      editable.focus();
      editor.revealCurrentSelection.mockReturnValue(false);
      let resolveRect;
      callIOSBridge.mockReturnValue(
        new Promise((resolve) => {
          resolveRect = resolve;
        }),
      );
      arrow("ArrowDown");
      await flushReveal();
      if (action === "next-arrow") arrow("ArrowUp");
      if (action === "tap") mouseDown(editable);
      if (action === "blur") editable.blur();
      if (action === "cleanup") cleanup();
      if (action === "dismiss")
        viewport.dispatchEvent(new window.Event("resize"));
      resolveRect({ x: 80, y: 460, width: 2, height: 20, viewWidth: 390 });
      await Promise.resolve();
      expect(editor.revealSelectionRect).not.toHaveBeenCalled();
    },
  );

  it("coalesces rapid arrows and leaves unrelated keys and modifiers alone", async () => {
    editable.focus();
    arrow("ArrowDown", { ctrlKey: true });
    arrow("ArrowUp", { isComposing: true });
    arrow("a");
    expect(frames.size).toBe(0);
    arrow("ArrowDown");
    arrow("ArrowDown");
    arrow("ArrowUp");
    await flushReveal();
    expect(editor.revealCurrentSelection).toHaveBeenCalledExactlyOnceWith({
      behavior: "auto",
      direction: "up",
    });
  });

  it("reports native failures once until a successful request, without altering focus", async () => {
    editable.focus();
    editor.revealCurrentSelection.mockReturnValue(false);
    callIOSBridge.mockRejectedValue(new Error("Bridge unavailable"));
    for (let index = 0; index < 2; index += 1) {
      arrow("ArrowDown");
      await flushReveal();
    }
    expect(onRevealError).toHaveBeenCalledTimes(1);
    expect(editor.revealSelectionRect).not.toHaveBeenCalled();
    expect(editable.getRootNode().activeElement).toBe(editable);
    callIOSBridge.mockResolvedValueOnce(undefined);
    arrow("ArrowDown");
    await flushReveal();
    arrow("ArrowDown");
    await flushReveal();
    expect(onRevealError).toHaveBeenCalledTimes(2);
  });
});
