import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const installDomGlobals = () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const previousGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
  };

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;

  return () => {
    for (const [name, value] of Object.entries(previousGlobals)) {
      if (value === undefined) {
        delete globalThis[name];
      } else {
        globalThis[name] = value;
      }
    }

    dom.window.close();
  };
};

describe("lexical scene document editor line previews", () => {
  it("renders conditional action markers in right-gutter preview items", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const previewHost = {
        createIconPreview({ icon }) {
          const item = document.createElement("div");
          item.className = "preview-item";
          const iconElement = document.createElement("rtgl-svg");
          iconElement.setAttribute("svg", icon);
          item.append(iconElement);
          return item;
        },
      };

      const signature = JSON.parse(
        LexicalSceneDocumentEditorElement.prototype.buildRightGutterSignature({
          hasConditional: true,
        }),
      );
      const previewItems =
        LexicalSceneDocumentEditorElement.prototype.createPreviewItems.call(
          previewHost,
          { hasConditional: true },
        );

      expect(signature.hasConditional).toBe(true);
      expect(
        Array.from(previewItems.querySelectorAll("rtgl-svg")).map((icon) =>
          icon.getAttribute("svg"),
        ),
      ).toEqual(["settings"]);
    } finally {
      restoreDomGlobals();
    }
  });
});
