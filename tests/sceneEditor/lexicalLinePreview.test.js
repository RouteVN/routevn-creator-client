import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const installDomGlobals = () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const previousGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    getComputedStyle: globalThis.getComputedStyle,
  };

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);

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

  it("renders update variable action markers in right-gutter preview items", async () => {
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
          hasUpdateVariable: true,
        }),
      );
      const previewItems =
        LexicalSceneDocumentEditorElement.prototype.createPreviewItems.call(
          previewHost,
          { hasUpdateVariable: true },
        );

      expect(signature.hasUpdateVariable).toBe(true);
      expect(
        Array.from(previewItems.querySelectorAll("rtgl-svg")).map((icon) =>
          icon.getAttribute("svg"),
        ),
      ).toEqual(["variable"]);
    } finally {
      restoreDomGlobals();
    }
  });

  it("renders input form action markers in right-gutter preview items", async () => {
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
          hasInput: true,
        }),
      );
      const previewItems =
        LexicalSceneDocumentEditorElement.prototype.createPreviewItems.call(
          previewHost,
          { hasInput: true },
        );

      expect(signature.hasInput).toBe(true);
      expect(
        Array.from(previewItems.querySelectorAll("rtgl-svg")).map((icon) =>
          icon.getAttribute("svg"),
        ),
      ).toEqual(["input"]);
    } finally {
      restoreDomGlobals();
    }
  });

  it("renders voice action markers in right-gutter preview items", async () => {
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
          hasVoice: true,
        }),
      );
      const previewItems =
        LexicalSceneDocumentEditorElement.prototype.createPreviewItems.call(
          previewHost,
          { hasVoice: true },
        );

      expect(signature.hasVoice).toBe(true);
      expect(
        Array.from(previewItems.querySelectorAll("rtgl-svg")).map((icon) =>
          icon.getAttribute("svg"),
        ),
      ).toEqual(["microphone"]);
    } finally {
      restoreDomGlobals();
    }
  });

  it.each(["ADV", "NVL"])(
    "renders deleted dialogue as an icon with an x mark and no %s label",
    async (dialogueModeLabel) => {
      const restoreDomGlobals = installDomGlobals();

      try {
        const { LexicalSceneDocumentEditorElement } = await import(
          "../../src/primitives/lexicalSceneDocumentEditor.js"
        );
        const editorPrototype = LexicalSceneDocumentEditorElement.prototype;
        const previewItems = editorPrototype.createPreviewItems.call(
          editorPrototype,
          {
            hasDialogueLayout: true,
            dialogueChangeType: "delete",
            dialogueModeLabel,
          },
        );

        expect(
          previewItems.querySelector(".preview-delete-overlay"),
        ).toBeNull();
        expect(previewItems.textContent).toBe("");
        expect(
          previewItems.querySelector(".preview-icon-delete-mark"),
        ).not.toBeNull();
        expect(
          previewItems.querySelector(".preview-dialogue-item"),
        ).not.toBeNull();
        expect(
          Array.from(previewItems.querySelectorAll("rtgl-svg")).map((icon) =>
            icon.getAttribute("svg"),
          ),
        ).toEqual(["dialogue", "x"]);
        expect(
          Array.from(previewItems.querySelectorAll("rtgl-svg")).map((icon) =>
            icon.getAttribute("wh"),
          ),
        ).toEqual(["24", "20"]);
      } finally {
        restoreDomGlobals();
      }
    },
  );

  it("summarizes only previews that do not fit and restores them when the gutter grows", async () => {
    const restoreDomGlobals = installDomGlobals();
    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editor = LexicalSceneDocumentEditorElement.prototype;
      const previews = editor.createPreviewItems({
        hasDialogueLayout: true,
        hasControl: true,
        hasVoice: true,
        hasSfx: true,
        hasChoices: true,
        hasInput: true,
      });
      const items = [...previews.querySelectorAll(":scope > .preview-item")];
      const overflow = previews.querySelector(".preview-overflow");
      overflow.getBoundingClientRect = () => ({ width: 16 });
      previews.style.columnGap = "8px";
      previews.getBoundingClientRect = () => ({ left: 100, width: 184 });
      items.forEach((item, index) => {
        item.getBoundingClientRect = () => ({ right: 124 + index * 32 });
      });
      const row = document.createElement("div");
      row.append(previews);
      const line = document.createElement("p");

      editor.syncLineRightGutterWidth(line, row, 100);
      expect(items.map((item) => item.hidden)).toEqual([
        false,
        false,
        true,
        true,
        true,
        true,
      ]);
      expect(overflow.hidden).toBe(false);
      expect(overflow.textContent).toBe("+4");
      expect(line.style.paddingRight).toBe("100px");

      editor.syncLineRightGutterWidth(line, row, 24);
      expect(items.every((item) => item.hidden)).toBe(true);
      expect(overflow.textContent).toBe("+6");

      editor.syncLineRightGutterWidth(line, row, 200);
      expect(items.every((item) => !item.hidden)).toBe(true);
      expect(overflow.hidden).toBe(true);
      expect(line.style.paddingRight).toBe("184px");

      editor.syncLineRightGutterWidth(line, row, 100);
      expect(items.filter((item) => !item.hidden)).toHaveLength(2);
      expect(overflow.textContent).toBe("+4");
    } finally {
      restoreDomGlobals();
    }
  });

  it("renders changed dialogue speaker sprites in the right gutter", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorPrototype = LexicalSceneDocumentEditorElement.prototype;
      const layers = [
        {
          kind: "image",
          itemId: "sprite-neutral",
          fileId: "file-sprite-neutral",
          previewKey: "image:sprite-neutral:file-sprite-neutral",
        },
      ];
      const dialogueSprite = {
        changeType: "delete",
        fileId: "file-sprite-neutral",
        spriteFileIds: ["file-sprite-neutral"],
        spritePreviewBr: "none",
        spritePreviewLayers: layers,
      };

      const signature = JSON.parse(
        editorPrototype.buildRightGutterSignature({ dialogueSprite }),
      );
      const previewItems = editorPrototype.createPreviewItems.call(
        editorPrototype,
        { dialogueSprite },
      );
      const preview = previewItems.querySelector("rvn-stacked-file-images");

      expect(signature.dialogueSprite).toEqual(dialogueSprite);
      expect(preview).not.toBeNull();
      expect(preview.layers).toEqual(layers);
      expect(preview.w).toBe("20");
      expect(preview.h).toBe("24");
      expect(
        previewItems.querySelector(".preview-group-delete-overlay"),
      ).not.toBeNull();
    } finally {
      restoreDomGlobals();
    }
  });

  it("renders character sprite line previews from layered preview data", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorPrototype = LexicalSceneDocumentEditorElement.prototype;
      const atlas = {
        frames: {
          idle0: {
            frame: { x: 0, y: 0, w: 64, h: 64 },
          },
        },
      };
      const animation = {
        frames: [0],
        fps: 12,
      };
      const layers = [
        {
          kind: "spritesheet",
          itemId: "sprite-idle",
          fileId: "file-idle",
          atlas,
          animation,
          animationName: "idle",
          previewKey: "spritesheet:sprite-idle:file-idle:idle:0:12",
        },
      ];

      const previewItems = editorPrototype.createPreviewItems.call(
        editorPrototype,
        {
          characterSprites: {
            changeType: "set",
            items: [
              {
                characterId: "character-1",
                characterName: "Aki",
                fileId: "file-idle",
                spriteFileIds: ["file-idle"],
                spritePreviewBr: "none",
                spritePreviewLayers: layers,
              },
            ],
          },
        },
      );

      const preview = previewItems.querySelector("rvn-stacked-file-images");

      expect(previewItems.querySelector("rvn-file-image")).toBeNull();
      expect(preview).not.toBeNull();
      expect(preview.layers).toEqual(layers);
      expect(preview.w).toBe("20");
      expect(preview.h).toBe("24");
      expect(preview.br).toBe("none");
      expect(preview.spritesheetBr).toBe("none");
      expect(preview.spritesheetCheckerCellSize).toBe("4");
      expect(preview.showSpritesheetCheckerboard).toBe(false);
    } finally {
      restoreDomGlobals();
    }
  });

  it("distinguishes visual placeholders from background placeholders", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorPrototype = LexicalSceneDocumentEditorElement.prototype;
      const previewItems = editorPrototype.createPreviewItems.call(
        editorPrototype,
        {
          background: {},
          visual: { items: [] },
        },
      );

      expect(
        Array.from(previewItems.querySelectorAll("rtgl-svg")).map((icon) =>
          icon.getAttribute("svg"),
        ),
      ).toEqual(["image", "stacked-images"]);
    } finally {
      restoreDomGlobals();
    }
  });

  it("uses smaller action icons for compact mobile previews", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorPrototype = LexicalSceneDocumentEditorElement.prototype;
      const preview = editorPrototype.createIconPreview.call(
        {
          state: {
            compactPreviews: true,
          },
          createSvgIcon: editorPrototype.createSvgIcon,
        },
        {
          icon: "music",
        },
      );

      expect(preview.querySelector("rtgl-svg").getAttribute("wh")).toBe("16");
    } finally {
      restoreDomGlobals();
    }
  });

  it("uses smaller image thumbnails for compact mobile previews", async () => {
    const restoreDomGlobals = installDomGlobals();

    try {
      const { LexicalSceneDocumentEditorElement } = await import(
        "../../src/primitives/lexicalSceneDocumentEditor.js"
      );
      const editorPrototype = LexicalSceneDocumentEditorElement.prototype;
      const preview = editorPrototype.createMediaThumb.call(
        {
          state: {
            compactPreviews: true,
          },
          createFileImage: editorPrototype.createFileImage,
          createSvgIcon: editorPrototype.createSvgIcon,
        },
        {
          fileId: "background-file",
          size: "bg",
        },
      );
      const image = preview.querySelector("rvn-file-image");

      expect(image.getAttribute("w")).toBe("24");
      expect(image.getAttribute("h")).toBe("16");
    } finally {
      restoreDomGlobals();
    }
  });
});
