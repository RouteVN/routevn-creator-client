import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dom;
let owner;
let editable;
let line;
let nativeRange;

beforeEach(async () => {
  dom = new JSDOM("<!doctype html><div id='host'></div>");
  for (const name of [
    "window",
    "document",
    "HTMLElement",
    "Element",
    "Node",
    "ShadowRoot",
  ]) {
    vi.stubGlobal(name, name === "window" ? dom.window : dom.window[name]);
  }
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback) =>
    setTimeout(callback, 16),
  );
  const { LexicalSceneDocumentEditorElement } = await import(
    "../../src/primitives/lexicalSceneDocumentEditor.js"
  );
  owner = Object.create(LexicalSceneDocumentEditorElement.prototype);
  const host = document.querySelector("#host");
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML =
    '<div contenteditable="true"><p class="editor-paragraph">alpha beta gamma</p></div>';
  editable = shadow.firstChild;
  line = editable.firstChild;
  nativeRange = document.createRange();
  nativeRange.setStart(line.firstChild, 3);
  nativeRange.collapse(true);
  const hiddenRange = document.createRange();
  hiddenRange.setStart(host, 0);
  hiddenRange.collapse(true);
  vi.spyOn(window, "getSelection").mockImplementation(() => ({
    rangeCount: 1,
    getRangeAt: () => hiddenRange,
  }));
  document.caretRangeFromPoint = () => hiddenRange;
  owner.refs = { editor: editable };
  owner.state = { mode: "text-editor", selectedLineId: "line-1" };
  owner.isEditorFocused = true;
  Object.defineProperty(owner, "isConnected", { value: true });
  owner.getLineIdFromLineElement = (element) =>
    element === line ? "line-2" : undefined;
  owner.getLineIdFromRange = () => undefined;
  owner.setMode = vi.fn();
  owner.isEditorActiveElement = () => true;
  owner.focus = vi.fn();
  owner.scheduleRender = vi.fn();
  owner.dispatchSelectedLineChanged = vi.fn();
  owner.focusLine = vi.fn(({ cursorPosition }) => {
    nativeRange.setStart(
      line.firstChild,
      cursorPosition < 0 ? line.textContent.length : cursorPosition,
    );
    nativeRange.collapse(true);
    return true;
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  dom.window.close();
});

describe("scene editor pointer selection with hidden shadow selections", () => {
  it("keeps the browser caret and selects the clicked line when hit testing is unresolved", () => {
    const event = { button: 0, target: line, clientX: 90, clientY: 30 };
    owner.pendingPointerFallbackSelection =
      owner.createPointerFallbackSelection(event);
    expect(owner.pendingPointerFallbackSelection.cursorPosition).toBe(-1);

    owner.handleNativeMouseUp(event);
    vi.runAllTimers();

    expect(nativeRange.startOffset).toBe(3);
    expect(owner.focusLine).not.toHaveBeenCalled();
    expect(owner.focus).not.toHaveBeenCalled();
    expect(owner.state.selectedLineId).toBe("line-2");
    expect(owner.dispatchSelectedLineChanged).toHaveBeenCalledWith("line-2", {
      cursorPosition: undefined,
      isCollapsed: false,
      mode: "text-editor",
    });
  });

  it("preserves native word selection when hit testing cannot read the shadow tree", () => {
    nativeRange.setEnd(line.firstChild, 5);
    owner.handleNativeMouseUp({ button: 0, target: line });
    vi.runAllTimers();
    expect(nativeRange.startOffset).toBe(3);
    expect(nativeRange.endOffset).toBe(5);
    expect(owner.focusLine).not.toHaveBeenCalled();
  });

  it.each([0, 4, 16])(
    "still restores a known pointer offset of %s",
    (cursorPosition) => {
      const fallback = { lineId: "line-2", cursorPosition };
      expect(owner.restorePointerFallbackSelection(fallback)).toBe(true);
      expect(nativeRange.startOffset).toBe(cursorPosition);
      owner.schedulePointerFallbackSelectionValidation(fallback);
      vi.runAllTimers();
      expect(nativeRange.startOffset).toBe(cursorPosition);
    },
  );

  it("does not schedule line-end restoration for an unresolved point", () => {
    const fallback = { lineId: "line-2", cursorPosition: -1 };
    expect(owner.restorePointerFallbackSelection(fallback)).toBe(false);
    owner.schedulePointerFallbackSelectionValidation(fallback);
    expect(vi.getTimerCount()).toBe(0);
  });
});
