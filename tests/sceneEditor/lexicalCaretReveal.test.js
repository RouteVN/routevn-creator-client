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
