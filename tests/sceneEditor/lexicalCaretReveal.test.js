import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dom;
let owner;
let scroller;

beforeEach(async () => {
  dom = new JSDOM(
    "<!doctype html><div id='scroll'><div id='host'></div></div>",
  );
  for (const name of ["window", "document", "HTMLElement", "ShadowRoot"]) {
    vi.stubGlobal(name, name === "window" ? dom.window : dom.window[name]);
  }
  Object.defineProperty(window, "innerHeight", { value: 844 });
  Object.defineProperty(window, "visualViewport", {
    value: { height: 464, offsetTop: 0 },
  });
  const { LexicalSceneDocumentEditorElement } = await import(
    "../../src/primitives/lexicalSceneDocumentEditor.js"
  );
  owner = Object.create(LexicalSceneDocumentEditorElement.prototype);
  const shadow = document.querySelector("#host").attachShadow({ mode: "open" });
  shadow.innerHTML = '<div contenteditable="true"></div>';
  owner.refs = { editor: shadow.firstChild };
  scroller = document.querySelector("#scroll");
  scroller.style.overflowY = "auto";
  Object.defineProperty(scroller, "clientHeight", { value: 577 });
  Object.defineProperty(scroller, "scrollHeight", { value: 1190 });
  scroller.scrollTop = 100;
  scroller.getBoundingClientRect = () => ({
    top: 267,
    bottom: 844,
    height: 577,
  });
  scroller.scrollTo = vi.fn();
  window.scrollTo = vi.fn();
});

afterEach(() => {
  dom.window.close();
  vi.unstubAllGlobals();
});

const caret = (top) => ({
  left: 80,
  right: 82,
  top,
  bottom: top + 21,
  width: 2,
  height: 21,
});

describe("scene editor native caret reveal", () => {
  it("syncs the selected line to UIKit's caret without moving the native selection", () => {
    owner.state = {
      mode: "text-editor",
      selectionActive: true,
      selectedLineId: "line-1",
      lines: Array.from({ length: 6 }, (_, index) => ({
        id: `line-${index + 1}`,
      })),
    };
    owner.lineKeyById = new Map(
      owner.state.lines.map((line) => [line.id, line.id]),
    );
    owner.editor = {
      getElementByKey: (key) => ({
        getBoundingClientRect: () => {
          const top = 100 + (Number(key.slice(5)) - 1) * 32;
          return { left: 40, right: 320, top, bottom: top + 32 };
        },
      }),
    };
    owner.scheduleRender = vi.fn();
    owner.dispatchSelectedLineChanged = vi.fn();
    const selection = document.getSelection();
    const initialAnchor = selection.anchorNode;

    expect(owner.syncSelectionFromCaretRect({ rect: caret(230) })).toEqual({
      lineId: "line-5",
      x: 40,
      y: 2,
    });
    expect(owner.state.selectedLineId).toBe("line-5");
    expect(owner.syncSelectionFromCaretRect({ rect: caret(198) }).lineId).toBe(
      "line-4",
    );
    expect(owner.state.selectedLineId).toBe("line-4");
    expect(owner.dispatchSelectedLineChanged).toHaveBeenLastCalledWith(
      "line-4",
      {
        mode: "text-editor",
        isCollapsed: true,
      },
    );
    expect(selection.anchorNode).toBe(initialAnchor);
    expect(scroller.scrollTo).not.toHaveBeenCalled();
  });

  it("scrolls a downward caret above the iOS keyboard and toolbar inside the dialogue list", () => {
    expect(
      owner.revealSelectionRect({ rect: caret(453), direction: "down" }),
    ).toBe(true);
    expect(scroller.scrollTo).toHaveBeenCalledWith({
      top: 181,
      behavior: "auto",
    });
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("scrolls upward when the caret is clipped by the fixed preview", () => {
    owner.revealSelectionRect({ rect: caret(240), direction: "up" });
    expect(scroller.scrollTo).toHaveBeenCalledWith({
      top: 29,
      behavior: "auto",
    });
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it.each(["up", "down"])(
    "leaves an already-visible caret in place moving %s",
    (direction) => {
      expect(owner.revealSelectionRect({ rect: caret(333), direction })).toBe(
        true,
      );
      expect(scroller.scrollTo).not.toHaveBeenCalled();
    },
  );

  it("does not scroll without caret geometry", () => {
    expect(owner.revealSelectionRect()).toBe(false);
    expect(scroller.scrollTo).not.toHaveBeenCalled();
  });
});
