import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, it, vi } from "vitest";

let owner;

beforeEach(async () => {
  const dom = new JSDOM("<!doctype html>");
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
  const { LexicalSceneDocumentEditorElement } = await import(
    "../../src/primitives/lexicalSceneDocumentEditor.js"
  );
  owner = Object.create(LexicalSceneDocumentEditorElement.prototype);
  // Lexical's range selection is still on line 1 from an earlier text edit.
  owner.readEditorSnapshot = vi.fn(() => ({ selectedLineId: "line-1" }));
});

describe("scene editor selected line snapshot", () => {
  it("returns the highlighted line in block mode, not a stale text caret", () => {
    owner.state = { mode: "block", selectedLineId: "line-5" };

    expect(owner.getSelectedLineIdSnapshot()).toBe("line-5");
    expect(owner.readEditorSnapshot).not.toHaveBeenCalled();
  });

  it("returns the text caret line in text mode", () => {
    owner.state = { mode: "text-editor", selectedLineId: "line-5" };

    expect(owner.getSelectedLineIdSnapshot()).toBe("line-1");
  });

  it("falls back to the caret line in block mode without a selected line", () => {
    owner.state = { mode: "block", selectedLineId: undefined };

    expect(owner.getSelectedLineIdSnapshot()).toBe("line-1");
  });
});
