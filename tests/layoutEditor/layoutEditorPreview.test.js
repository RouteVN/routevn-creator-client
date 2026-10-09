import { describe, expect, it } from "vitest";
import {
  createLayoutEditorHoverOverlay,
  loadLayoutEditorAssets,
  createLayoutEditorRenderedElements,
  createLayoutEditorRenderState,
  createLayoutEditorAssetReferences,
  createLayoutEditorSelectionOverlay,
  formatLayoutEditorPreviewDate,
} from "../../src/components/layoutEditorCanvas/support/layoutEditorCanvasRender.js";
import { createLayoutEditorPreviewData } from "../../src/internal/layoutEditorPreview/layoutEditorPreviewData.js";
import {
  createLayoutThumbnailSource,
  toLayoutPreviewType,
} from "../../src/internal/layoutPreview.js";
import * as previewComponentStore from "../../src/components/layoutEditorPreview/layoutEditorPreview.store.js";
import { getRuntimeFieldItems } from "../../src/internal/runtimeFields.js";
import {
  AUTO_MODE_CONDITION_TARGET,
  LINE_COMPLETED_CONDITION_TARGET,
  SKIP_MODE_CONDITION_TARGET,
} from "../../src/internal/layoutConditions.js";

describe("layoutEditorPreview", () => {
  it("renders a character sprite above the layout with its selected transform and loads its asset", () => {
    const layoutState = {
      id: "layout-1",
      layoutType: "dialogue-adv",
      elements: {
        items: {
          panel: { id: "panel", type: "container", width: 200, height: 100 },
        },
        tree: [{ id: "panel" }],
      },
    };
    const repositoryState = {
      characters: {
        items: {
          "character-1": {
            type: "character",
            sprites: {
              items: {
                "sprite-1": {
                  id: "sprite-1",
                  type: "image",
                  fileId: "sprite-file",
                  width: 80,
                  height: 120,
                },
              },
            },
          },
        },
      },
      transforms: {
        items: {
          "transform-1": {
            type: "transform",
            x: 150,
            y: 200,
            anchorX: 0.5,
            anchorY: 1,
            scaleX: -0.5,
            scaleY: 0.5,
            rotation: 15,
          },
        },
      },
    };
    const previewData = {
      dialogue: {
        character: {
          sprite: {
            transformId: "transform-1",
            items: [{ id: "base", resourceId: "sprite-1" }],
          },
        },
      },
    };
    const result = createLayoutEditorAssetReferences({
      layoutState,
      repositoryState,
      previewData,
    });
    expect(result.renderedElements.at(-1)).toMatchObject({
      id: "layout-editor-preview-character-sprite",
      type: "container",
      x: 150,
      y: 200,
      anchorX: 0.5,
      anchorY: 1,
      scaleX: -0.5,
      scaleY: 0.5,
      rotation: 15,
      children: [
        { type: "sprite", src: "sprite-file", width: 80, height: 120 },
      ],
    });
    expect(result.fileReferences).toEqual(
      expect.arrayContaining([expect.objectContaining({ url: "sprite-file" })]),
    );
    previewData.dialogue.character.sprite.items = [];
    expect(
      createLayoutEditorAssetReferences({
        layoutState,
        repositoryState,
        previewData,
      }).renderedElements,
    ).toHaveLength(1);
  });

  it("preserves authored spritesheet avatar dimensions and skips deleted sprites", () => {
    const layoutState = {
      id: "layout-1",
      layoutType: "dialogue-adv",
      elements: { items: {}, tree: [] },
    };
    const previewData = {
      dialogue: {
        character: {
          sprite: { items: [{ id: "base", resourceId: "sprite-1" }] },
        },
      },
    };
    const repositoryState = {
      characters: {
        items: {
          "character-1": {
            sprites: {
              items: {
                "sprite-1": {
                  id: "sprite-1",
                  type: "spritesheet",
                  fileId: "sheet-file",
                  width: 96,
                  height: 80,
                  jsonData: {
                    frames: { one: { frame: { x: 0, y: 0, w: 32, h: 32 } } },
                  },
                  animations: { blink: { frames: ["one"], fps: 8 } },
                },
              },
            },
          },
        },
      },
    };
    const result = createLayoutEditorAssetReferences({
      layoutState,
      repositoryState,
      previewData,
    });
    expect(result.renderedElements[0].children[0]).toMatchObject({
      type: "spritesheet-animation",
      src: "sheet-file",
      width: 96,
      height: 80,
      playback: { clip: "blink", fps: 8 },
    });
    expect(result.fileReferences).toEqual(
      expect.arrayContaining([expect.objectContaining({ url: "sheet-file" })]),
    );
    repositoryState.characters.items = {};
    expect(
      createLayoutEditorAssetReferences({
        layoutState,
        repositoryState,
        previewData,
      }).renderedElements,
    ).toEqual([]);
  });

  it("loads font assets with their persisted weight descriptor", async () => {
    const { assets } = await loadLayoutEditorAssets({
      projectService: {
        getFileContent: async () => ({ url: "font://semibold" }),
      },
      fileReferences: [{ url: "font-file", type: "font/ttf" }],
      fontsItems: {
        "font-600": {
          id: "font-600",
          type: "font",
          name: "Semibold.ttf",
          fileId: "font-file",
          minWeight: 600,
          defaultWeight: 600,
          maxWeight: 600,
        },
      },
    });

    expect(assets).toEqual({
      "font-file": {
        url: "font://semibold",
        type: "font/ttf",
        fontWeightDescriptor: "600",
      },
    });
  });

  it("creates one-sided hover rects with CSS-scaled renderer strokes", () => {
    const overlays = createLayoutEditorHoverOverlay({
      bounds: {
        corners: [
          { x: 10, y: 20 },
          { x: 110, y: 20 },
          { x: 110, y: 60 },
          { x: 10, y: 60 },
        ],
      },
      canvasUnitsPerCssPixel: 2,
    });

    expect(overlays).toHaveLength(2);
    expect(overlays[0]).toMatchObject({
      id: "hover-border-outer",
      x: 9,
      y: 19,
      width: 102,
      height: 42,
      fill: "transparent",
      border: {
        color: "#ffffff",
        width: 2,
      },
    });
    expect(overlays[1]).toMatchObject({
      id: "hover-border-inner",
      x: 11,
      y: 21,
      width: 98,
      height: 38,
      fill: "transparent",
      border: {
        color: "#b3b3b3",
        width: 2,
      },
    });

    const selectionOverlays = createLayoutEditorSelectionOverlay({
      selectedItemId: "selected",
      occurrencesById: {
        selected: {
          ownerItemId: "selected",
        },
      },
      occurrenceIdsByOwner: {
        selected: ["selected"],
      },
      selectedItem: {
        type: "container-ref-choice-item",
      },
      parsedElements: [
        {
          id: "selected",
          type: "rect",
          width: 100,
          height: 40,
        },
      ],
      canvasUnitsPerCssPixel: 2,
    });
    const [selectionOuter, selectionInner, , selectionAnchor] =
      selectionOverlays[0].children;

    expect(selectionOuter.fill).toBe("transparent");
    expect(selectionInner.fill).toBe("transparent");
    expect(selectionOuter.border.width).toBe(2);
    expect(selectionInner.border.width).toBe(2);
    expect(selectionAnchor).toMatchObject({
      width: 16,
      height: 16,
      fill: {
        type: "radial-gradient",
      },
    });
    expect(selectionAnchor.border).toBeUndefined();
  });

  it("keeps overlay strokes one renderer pixel wide when zoomed past the project resolution", () => {
    // Four CSS pixels per canvas unit: a one-CSS-pixel line would be a
    // quarter of a renderer pixel and fade out.
    const [hoverOuter, hoverInner] = createLayoutEditorHoverOverlay({
      bounds: {
        corners: [
          { x: 10, y: 20 },
          { x: 110, y: 20 },
          { x: 110, y: 60 },
          { x: 10, y: 60 },
        ],
      },
      canvasUnitsPerCssPixel: 0.25,
    });
    expect(hoverOuter).toMatchObject({
      x: 9.5,
      y: 19.5,
      width: 101,
      height: 41,
      border: { width: 1 },
    });
    expect(hoverInner).toMatchObject({
      x: 10.5,
      y: 20.5,
      width: 99,
      height: 39,
      border: { width: 1 },
    });

    const [selection] = createLayoutEditorSelectionOverlay({
      selectedItemId: "selected",
      occurrencesById: { selected: { ownerItemId: "selected" } },
      occurrenceIdsByOwner: { selected: ["selected"] },
      selectedItem: { type: "container-ref-choice-item" },
      parsedElements: [
        { id: "selected", type: "rect", width: 100, height: 40 },
      ],
      canvasUnitsPerCssPixel: 0.25,
    });
    const [outer, inner, , anchor] = selection.children;
    expect(outer).toMatchObject({
      x: -0.5,
      y: -0.5,
      width: 101,
      height: 41,
      border: { width: 1 },
    });
    expect(inner).toMatchObject({
      x: 0.5,
      y: 0.5,
      width: 99,
      height: 39,
      border: { width: 1 },
    });
    // Handles keep their CSS size; they are several pixels wide.
    expect(anchor).toMatchObject({ width: 2, height: 2 });
  });

  it("formats the authored English and CJK date presets", () => {
    const timestamp = new Date(2026, 11, 31, 12).getTime();

    expect(formatLayoutEditorPreviewDate(timestamp, "DD MMM YYYY")).toBe(
      "31 Dec 2026",
    );
    expect(
      formatLayoutEditorPreviewDate(
        new Date(2027, 6, 20, 12).getTime(),
        "DD MMM YYYY",
      ),
    ).toBe("20 Jul 2027");
    expect(formatLayoutEditorPreviewDate(timestamp, "YYYY年MM月DD日")).toBe(
      "2026年12月31日",
    );
  });

  it("builds stable preview data from variables, dialogue defaults, and choices", () => {
    const previewData = createLayoutEditorPreviewData({
      variablesData: {
        items: {
          numberVar: { type: "variable", variableType: "number", value: "7" },
          boolVar: {
            type: "variable",
            variableType: "boolean",
            value: "true",
          },
          folder: { type: "folder" },
        },
      },
      dialogueDefaultValues: {
        "dialogue-character-id": "character-1",
        "dialogue-character-name": "Aki",
        "dialogue-content": "Hello there",
      },
      choicesData: {
        items: [{ content: "First" }, {}],
      },
    });

    expect(previewData.variables).toMatchObject({
      numberVar: 7,
      boolVar: true,
    });
    expect(previewData.runtime.dialogueTextSpeed).toBe(50);
    expect(previewData.runtime.soundVolume).toBe(50);
    expect(previewData.runtime.musicVolume).toBe(50);
    expect(previewData.dialogue.characterId).toBe("character-1");
    expect(previewData.dialogue.character.name).toBe("Aki");
    expect(previewData.dialogue.content[0].text).toBe("Hello there");
    expect(previewData.dialogueLines).toEqual(previewData.dialogue.lines);
    expect(previewData.dialogue.lines[0]).toMatchObject({
      characterId: "character-1",
      character: {
        name: "Aki",
      },
      characterName: "Aki",
    });
    expect(previewData.choice.items).toEqual([
      {
        content: "First",
        events: {
          click: {
            actions: {},
          },
        },
      },
      {
        content: "Choice 2",
        events: {
          click: {
            actions: {},
          },
        },
      },
    ]);
    expect(previewData.saveSlots).toEqual([]);
  });

  it("resolves computed variables after stored and runtime preview overrides", () => {
    const previewData = createLayoutEditorPreviewData({
      variablesData: {
        items: {
          score: {
            type: "variable",
            variableType: "number",
            scope: "context",
            default: 5,
            value: 5,
          },
          total: {
            type: "variable",
            variableType: "number",
            scope: "context",
            computed: {
              expr: {
                add: [
                  { var: "variables.score" },
                  { var: "runtime.musicVolume" },
                ],
              },
            },
          },
        },
      },
      previewVariableValues: {
        "variables.score": 8,
        "runtime.musicVolume": 20,
      },
    });

    expect(previewData.variables).toMatchObject({
      score: 8,
      total: 28,
    });
  });

  it("builds save/load preview slots for repeating slot containers", () => {
    const saveLoadPreviewData = createLayoutEditorPreviewData({
      layoutType: "save-load",
      saveLoadData: {
        slots: [
          {
            id: "slot-1",
            saveImageId: "image-1",
            saveDate: "2026-03-10 18:00",
          },
          {
            id: "slot-2",
            saveImageId: "image-2",
            saveDate: "2026-03-11 18:00",
          },
        ],
      },
    });

    expect(saveLoadPreviewData.saveSlots).toHaveLength(2);
    expect(saveLoadPreviewData.saveSlots[0]).toMatchObject({
      slotId: 1,
      image: "image-1",
      savedAt: expect.any(Number),
    });
  });

  it("builds save/load preview slots when enabled from fragment context", () => {
    const previewData = createLayoutEditorPreviewData({
      layoutType: "normal",
      hasSaveLoadPreview: true,
      saveLoadData: {
        slots: [
          {
            id: "slot-1",
            saveDate: "2026-03-15 20:00",
          },
        ],
      },
    });

    expect(previewData.saveSlots).toHaveLength(1);
    expect(previewData.saveSlots[0]).toMatchObject({
      slotId: 1,
      savedAt: expect.any(Number),
    });
  });

  it("builds form preview values from input layout fields", () => {
    const previewData = createLayoutEditorPreviewData({
      layoutType: "input",
      currentLayoutId: "layout-input",
      currentLayoutData: {
        items: {
          "name-input": {
            id: "name-input",
            type: "input",
            field: "name",
            value: "Ada",
          },
          "code-input": {
            id: "code-input",
            type: "input",
            field: "code",
            value: "B42",
          },
        },
        tree: [{ id: "name-input" }, { id: "code-input" }],
      },
      layoutsData: {
        items: {},
        tree: [],
      },
      previewInputFieldValues: {
        name: "Mina",
      },
    });

    expect(previewData.form.values).toEqual({
      name: "Mina",
      code: "B42",
    });
    expect(previewData).not.toHaveProperty("runtime");
  });

  it("renders save/load layout elements before preview data is initialized", () => {
    const rendered = createLayoutEditorRenderedElements({
      layoutState: {
        id: "layout-1",
        layoutType: "save-load",
        elements: {
          items: {
            "slot-container": {
              type: "container-ref-save-load-slot",
              name: "Container (Save/Load Slot)",
              x: 0,
              y: 0,
              width: 400,
              height: 300,
              anchorX: 0,
              anchorY: 0,
              scaleX: 1,
              scaleY: 1,
              rotation: 0,
            },
          },
          tree: [{ id: "slot-container", children: [] }],
        },
      },
      repositoryState: {
        layouts: { items: {} },
        images: { items: {} },
        textStyles: { items: {} },
        colors: { items: {} },
        fonts: { items: {} },
      },
      previewData: {},
      graphicsService: {
        parse: ({ elements }) => ({ elements }),
      },
    });

    expect(rendered.elements).toEqual([]);
    expect(rendered.fileReferences).toEqual([]);
  });

  it("applies form preview values to input elements on the canvas", () => {
    const rendered = createLayoutEditorRenderedElements({
      layoutState: {
        id: "layout-input",
        layoutType: "input",
        elements: {
          items: {
            "name-input": {
              id: "name-input",
              type: "input",
              name: "Name Input",
              field: "name",
              x: 0,
              y: 0,
              width: 200,
              height: 40,
              anchorX: 0,
              anchorY: 0,
              scaleX: 1,
              scaleY: 1,
              rotation: 0,
              value: "Ada",
            },
          },
          tree: [{ id: "name-input", children: [] }],
        },
      },
      repositoryState: {
        layouts: { items: {} },
        images: { items: {} },
        textStyles: { items: {} },
        colors: { items: {} },
        fonts: { items: {} },
      },
      previewData: {
        form: {
          values: {
            name: "Mina",
          },
        },
      },
      graphicsService: {
        parse: ({ elements }) => ({ elements }),
      },
    });

    expect(rendered.elements[0]).toMatchObject({
      type: "input",
      field: "name",
      value: "Mina",
    });
  });

  it("renders history preview lines from characterName/text items", () => {
    const rendered = createLayoutEditorRenderedElements({
      layoutState: {
        id: "layout-history",
        layoutType: "history",
        elements: {
          items: {
            "history-item": {
              type: "container-ref-history-line",
              name: "Container (History Item)",
              x: 0,
              y: 0,
              width: 400,
              height: 120,
              anchorX: 0,
              anchorY: 0,
              scaleX: 1,
              scaleY: 1,
              rotation: 0,
            },
            "history-character": {
              type: "text-ref-history-line-character-name",
              name: "Text (History Character Name)",
              x: 0,
              y: 0,
              width: 200,
              height: 32,
              anchorX: 0,
              anchorY: 0,
              scaleX: 1,
              scaleY: 1,
              rotation: 0,
            },
            "history-content": {
              type: "text-ref-history-line-content",
              name: "Text (History Line Content)",
              x: 0,
              y: 40,
              width: 400,
              height: 64,
              anchorX: 0,
              anchorY: 0,
              scaleX: 1,
              scaleY: 1,
              rotation: 0,
            },
          },
          tree: [
            {
              id: "history-item",
              children: [
                {
                  id: "history-character",
                  children: [],
                },
                {
                  id: "history-content",
                  children: [],
                },
              ],
            },
          ],
        },
      },
      repositoryState: {
        layouts: { items: {} },
        images: { items: {} },
        textStyles: { items: {} },
        colors: { items: {} },
        fonts: { items: {} },
      },
      previewData: {
        historyDialogue: [
          {
            characterName: "Aki",
            text: "A saved line",
          },
        ],
      },
      graphicsService: {
        parse: ({ elements }) => ({ elements }),
      },
    });

    expect(rendered.elements[0]).toMatchObject({
      type: "container",
      id: "history-item-instance-0",
    });
    expect(rendered.elements[0].children[0]).toMatchObject({
      content: "Aki",
    });
    expect(rendered.elements[0].children[1]).toMatchObject({
      content: "A saved line",
    });
  });

  it("builds NVL preview lines from the editable content list", () => {
    const previewData = createLayoutEditorPreviewData({
      layoutType: "nvl",
      nvlDefaultValues: {
        linesNum: 2,
        characterNames: ["Aki", ""],
        lines: ["First NVL line", "Second NVL line"],
      },
    });

    expect(previewData.dialogue.lines).toEqual([
      {
        character: {
          name: "Aki",
        },
        characterName: "Aki",
        content: [{ text: "First NVL line" }],
      },
      {
        content: [{ text: "Second NVL line" }],
      },
    ]);
  });

  it("builds history preview lines from the editable history list", () => {
    const previewData = createLayoutEditorPreviewData({
      layoutType: "history",
      historyDefaultValues: {
        linesNum: 2,
        characterNames: ["Aki", ""],
        texts: ["First history line", "Second history line"],
      },
    });

    expect(previewData.historyDialogue).toEqual([
      {
        characterName: "Aki",
        text: "First history line",
      },
      {
        characterName: "",
        text: "Second history line",
      },
    ]);
  });

  it("omits dialogue-only preview sections for plain general layouts", () => {
    const previewData = createLayoutEditorPreviewData({
      layoutType: "general",
      currentLayoutId: "layout-title",
      currentLayoutData: {
        items: {
          background: {
            id: "background",
            type: "sprite",
          },
          title: {
            id: "title",
            type: "text",
          },
        },
        tree: [{ id: "background" }, { id: "title" }],
      },
      layoutsData: {
        items: {},
        tree: [],
      },
      dialogueDefaultValues: {
        "dialogue-character-name": "Aki",
        "dialogue-content": "Hello there",
      },
      choicesData: {
        items: [{ content: "First" }],
      },
    });

    expect(previewData).not.toHaveProperty("dialogue");
    expect(previewData).not.toHaveProperty("choice");
    expect(previewData).not.toHaveProperty("historyDialogue");
    expect(previewData).not.toHaveProperty("confirmDialog");
    expect(previewData).not.toHaveProperty("saveSlots");
    expect(previewData).not.toHaveProperty("runtime");
    expect(previewData).not.toHaveProperty("variables");
  });

  it("passes sprite blur through to the layout render state", () => {
    const blur = {
      x: 8,
      y: 10,
      quality: 4,
      kernelSize: 11,
      repeatEdgePixels: false,
    };
    const { renderStateElements } = createLayoutEditorRenderState({
      layoutState: {
        id: "layout-title",
        layoutType: "general",
        elements: {
          items: {
            background: {
              id: "background",
              type: "sprite",
              imageId: "image-1",
              x: 0,
              y: 0,
              width: 320,
              height: 180,
              blur,
            },
          },
          tree: [{ id: "background" }],
        },
      },
      repositoryState: {
        layouts: { items: {} },
        images: {
          items: {
            "image-1": {
              type: "image",
              fileId: "file-image-1",
            },
          },
        },
        textStyles: { items: {} },
        colors: { items: {} },
        fonts: { items: {} },
      },
    });

    expect(renderStateElements[0]).toMatchObject({
      id: "background",
      type: "sprite",
      imageId: "image-1",
      blur,
    });
  });

  it("keeps runtime but omits variables for dialogue layouts with runtime-only conditions", () => {
    const previewData = createLayoutEditorPreviewData({
      layoutType: "dialogue-adv",
      currentLayoutId: "layout-dialogue",
      currentLayoutData: {
        items: {
          skipBadge: {
            id: "skipBadge",
            type: "container",
            $when: "runtime.skipMode == true",
          },
          dialogueText: {
            id: "dialogueText",
            type: "text-revealing-ref-dialogue-content",
          },
        },
        tree: [{ id: "skipBadge" }, { id: "dialogueText" }],
      },
      layoutsData: {
        items: {},
        tree: [],
      },
      variablesData: {
        items: {},
      },
    });

    expect(previewData.runtime).toBeDefined();
    expect(previewData.dialogue).toBeDefined();
    expect(previewData).not.toHaveProperty("variables");
  });

  it("includes dialogue preview data for general layouts with dialogue character conditions", () => {
    const previewData = createLayoutEditorPreviewData({
      layoutType: "general",
      currentLayoutId: "layout-general",
      currentLayoutData: {
        items: {
          badge: {
            id: "badge",
            type: "container",
            $when: 'dialogue.characterId == "character-1"',
          },
        },
        tree: [{ id: "badge" }],
      },
      layoutsData: {
        items: {},
        tree: [],
      },
      variablesData: {
        items: {},
      },
    });

    expect(previewData.runtime).toBeDefined();
    expect(previewData.dialogue).toMatchObject({
      characterId: "",
      character: {
        name: "Character",
      },
    });
    expect(previewData).not.toHaveProperty("variables");
  });

  it("includes runtime fields in preview runtime data", () => {
    const previewData = createLayoutEditorPreviewData({
      variablesData: {
        items: {},
      },
    });
    const [firstRuntimeFieldId] = Object.keys(getRuntimeFieldItems());

    expect(firstRuntimeFieldId).toBeTruthy();
    expect(previewData.runtime).toHaveProperty(firstRuntimeFieldId);
  });

  it("overrides preview variables with edited values", () => {
    const previewData = createLayoutEditorPreviewData({
      variablesData: {
        items: {
          score: { type: "variable", variableType: "number", default: 1 },
          enabled: {
            type: "variable",
            variableType: "boolean",
            default: false,
          },
        },
      },
      previewVariableValues: {
        "variables.score": 42,
        "variables.enabled": true,
      },
    });

    expect(previewData.variables).toMatchObject({
      score: 42,
      enabled: true,
    });
  });

  it("includes fixed runtime state in preview data", () => {
    const previewData = createLayoutEditorPreviewData({
      previewVariableValues: {
        [AUTO_MODE_CONDITION_TARGET]: true,
        [LINE_COMPLETED_CONDITION_TARGET]: true,
        [SKIP_MODE_CONDITION_TARGET]: true,
      },
    });

    expect(previewData.runtime.isLineCompleted).toBe(true);
    expect(previewData.runtime.autoMode).toBe(true);
    expect(previewData.runtime.skipMode).toBe(true);
  });

  it("renders dialogue.characterId in preview templates", () => {
    const rendered = createLayoutEditorRenderedElements({
      layoutState: {
        id: "layout-1",
        layoutType: "general",
        elements: {
          items: {
            "text-1": {
              id: "text-1",
              type: "text",
              name: "Speaker Id",
              x: 0,
              y: 0,
              width: 200,
              height: 40,
              anchorX: 0,
              anchorY: 0,
              scaleX: 1,
              scaleY: 1,
              rotation: 0,
              content: "${dialogue.characterId}",
            },
          },
          tree: [{ id: "text-1", children: [] }],
        },
      },
      repositoryState: {
        layouts: { items: {} },
        images: { items: {} },
        textStyles: { items: {} },
        colors: { items: {} },
        fonts: { items: {} },
      },
      previewData: {
        dialogue: {
          characterId: "character-1",
          character: {
            name: "Aki",
          },
          content: [{ text: "Hello there" }],
          lines: [],
        },
      },
      graphicsService: {
        parse: ({ elements }) => ({ elements }),
      },
    });

    expect(rendered.elements[0]).toMatchObject({
      type: "text",
      content: "character-1",
    });
  });

  it("uses dialogue preview toggles for line completion, auto mode, and skip mode", () => {
    const previewData = createLayoutEditorPreviewData({
      layoutType: "dialogue",
      dialogueDefaultValues: {
        "dialogue-is-line-completed": true,
        "dialogue-auto-mode": true,
        "dialogue-skip-mode": true,
      },
    });

    expect(previewData.runtime.isLineCompleted).toBe(true);
    expect(previewData.runtime.autoMode).toBe(true);
    expect(previewData.runtime.skipMode).toBe(true);
  });

  it("creates a draggable overlay only for the first repeated instance", () => {
    const overlays = createLayoutEditorSelectionOverlay({
      selectedItemId: "target",
      occurrencesById: {
        "target-instance-0": {
          ownerItemId: "target",
        },
        "target-instance-1": {
          ownerItemId: "target",
        },
      },
      occurrenceIdsByOwner: {
        target: ["target-instance-0", "target-instance-1"],
      },
      parsedElements: [
        {
          id: "target-instance-0",
          type: "rect",
          x: 10,
          y: 20,
          width: 100,
          height: 40,
          originX: 50,
          originY: 20,
        },
        {
          id: "target-instance-1",
          type: "rect",
          x: 140,
          y: 20,
          width: 100,
          height: 40,
        },
      ],
    });

    expect(overlays).toHaveLength(1);
    expect(overlays[0].id).toBe("selected-border-group");
    expect(overlays[0].children).toHaveLength(9);
    expect(overlays[0].children[0]).toMatchObject({
      id: "selected-border-outer",
      x: -0.5,
      y: -0.5,
      width: 101,
      height: 41,
      border: {
        color: "#ffffff",
        width: 1,
        alpha: 1,
      },
    });
    expect(overlays[0].children[1]).toMatchObject({
      id: "selected-border-inner",
      x: 0.5,
      y: 0.5,
      width: 99,
      height: 39,
      border: {
        color: "#b3b3b3",
        width: 1,
        alpha: 1,
      },
    });
    expect(overlays[0].children[2]).toMatchObject({
      id: "selected-border",
      x: 0,
      y: 0,
      width: 100,
      height: 40,
    });
    expect(overlays[0].children[2].border).toBeUndefined();
    expect(overlays[0].children[2].hover).toEqual({
      cursor: "all-scroll",
    });
    expect(overlays[0].children[2].drag).toBeUndefined();
    expect(overlays[0].children[7]).toEqual({
      id: "selected-border-anchor",
      type: "rect",
      x: 46,
      y: 16,
      width: 8,
      height: 8,
      fill: {
        type: "radial-gradient",
        innerCenter: { x: 0.5, y: 0.5 },
        innerRadius: 0,
        outerCenter: { x: 0.5, y: 0.5 },
        outerRadius: 0.5,
        coordinateSpace: "local",
        stops: [
          { offset: 0, color: "#ffffff" },
          { offset: 0.74, color: "#ffffff" },
          { offset: 0.75, color: "#b3b3b3" },
          { offset: 0.99, color: "#b3b3b3" },
          { offset: 1, color: "transparent" },
        ],
      },
    });
    expect(overlays[0].children[8]).toMatchObject({
      id: "selected-border-rotate",
      type: "rect",
      x: 42,
      y: 12,
      width: 16,
      height: 16,
      cornerRadius: 8,
      hover: {
        cursor: "url(/public/layout-editor-rotate-cursor.svg) 16 16, grab",
      },
      drag: {
        start: {
          payload: {
            rotationPivotX: 60,
            rotationPivotY: 40,
          },
        },
      },
    });
  });

  it("does not add resize handles for container items without size controls", () => {
    const overlays = createLayoutEditorSelectionOverlay({
      selectedItemId: "choice-item",
      occurrencesById: {
        "choice-item": {
          ownerItemId: "choice-item",
        },
      },
      occurrenceIdsByOwner: {
        "choice-item": ["choice-item"],
      },
      selectedItem: {
        type: "container-ref-choice-item",
      },
      parsedElements: [
        {
          id: "choice-item",
          type: "container",
          x: 10,
          y: 20,
          width: 100,
          height: 40,
        },
      ],
    });

    expect(overlays).toHaveLength(1);
    expect(overlays[0].children.map((item) => item.id)).toEqual([
      "selected-border-outer",
      "selected-border-inner",
      "selected-border",
      "selected-border-anchor",
      "selected-border-rotate",
    ]);
  });

  it("keeps the rotation hit area centered on a rotated anchor", () => {
    const overlays = createLayoutEditorSelectionOverlay({
      selectedItemId: "target",
      occurrencesById: {
        target: {
          ownerItemId: "target",
        },
      },
      occurrenceIdsByOwner: {
        target: ["target"],
      },
      parsedElements: [
        {
          id: "target",
          type: "rect",
          x: 0,
          y: 0,
          width: 100,
          height: 40,
          originX: 50,
          originY: 20,
          rotation: 180,
        },
      ],
    });
    const rotationHandle = overlays[0].children.find(
      ({ id }) => id === "selected-border-rotate",
    );

    expect(rotationHandle).toMatchObject({
      x: 42,
      y: 12,
      width: 16,
      height: 16,
      cornerRadius: 8,
      drag: {
        move: {
          payload: {
            rotationPivotX: 50,
            rotationPivotY: 20,
          },
        },
      },
    });
  });

  it("does not add resize handles for auto-width text items", () => {
    const overlays = createLayoutEditorSelectionOverlay({
      selectedItemId: "text-item",
      occurrencesById: {
        "text-item": {
          ownerItemId: "text-item",
        },
      },
      occurrenceIdsByOwner: {
        "text-item": ["text-item"],
      },
      selectedItem: {
        type: "text",
        width: undefined,
      },
      parsedElements: [
        {
          id: "text-item",
          type: "text",
          x: 10,
          y: 20,
          width: 100,
          height: 40,
        },
      ],
    });

    expect(overlays).toHaveLength(1);
    expect(overlays[0].children.map((item) => item.id)).toEqual([
      "selected-border-outer",
      "selected-border-inner",
      "selected-border",
      "selected-border-anchor",
      "selected-border-rotate",
    ]);
  });
});

describe("layout thumbnails", () => {
  const createRepositoryState = () => ({
    project: { resolution: { width: 1280, height: 720 } },
    images: {
      items: {
        "image-1": {
          id: "image-1",
          type: "image",
          fileId: "file-image-1",
          fileType: "image/webp",
          width: 1280,
          height: 720,
        },
        "image-2": {
          id: "image-2",
          type: "image",
          fileId: "file-image-2",
          width: 64,
          height: 64,
        },
      },
    },
    fonts: {
      items: {
        "font-1": {
          id: "font-1",
          type: "font",
          name: "Display.woff2",
          fileId: "file-font-1",
          minWeight: 600,
          defaultWeight: 600,
          maxWeight: 600,
        },
      },
    },
    colors: { items: { "color-1": { type: "color", hex: "#ffffff" } } },
    textStyles: {
      items: {
        "style-1": {
          type: "textStyle",
          fontId: "font-1",
          colorId: "color-1",
          fontSize: 32,
          fontWeight: "600",
        },
      },
    },
    sounds: {
      items: {
        "sound-1": {
          type: "sound",
          fileId: "file-sound-1",
          fileType: "audio/mpeg",
        },
      },
    },
    particles: {
      items: {
        "particle-1": {
          type: "particle",
          width: 1280,
          height: 720,
          seed: 7,
          modules: { emission: {}, appearance: { texture: "image-2" } },
        },
      },
    },
    layouts: { items: {} },
  });
  const createLayout = (items) => ({
    id: "layout-1",
    type: "layout",
    layoutType: "general",
    elements: { items, tree: Object.keys(items).map((id) => ({ id })) },
    preview: { backgroundImageId: "image-1" },
  });
  const titleItems = {
    art: {
      id: "art",
      type: "sprite",
      imageId: "image-2",
      x: 0,
      y: 0,
      width: 64,
      height: 64,
    },
    title: {
      id: "title",
      type: "text",
      text: "Title One",
      textStyleId: "style-1",
      x: 10,
      y: 20,
      clickSoundId: "sound-1",
    },
  };

  // What the editor's canvas draws for a saved layout when it opens: its
  // Preview hydrated from the saved preview data, without selection chrome.
  const drawnByEditor = ({ item, repositoryState, layoutType }) => {
    const layoutState = {
      id: item.id,
      layoutType,
      elements: item.elements,
    };
    const state = previewComponentStore.createInitialState();
    previewComponentStore.setLayoutState({ state }, { layoutState });
    previewComponentStore.setRepositoryState({ state }, { repositoryState });
    previewComponentStore.hydratePreviewState(
      { state },
      { previewData: item.preview },
    );
    return createLayoutEditorAssetReferences({
      layoutState,
      repositoryState,
      previewData: previewComponentStore.selectPreviewData({ state }),
      resolution: { width: 1280, height: 720 },
    }).renderedElements;
  };

  it("draws a saved layout with its saved preview as the editor's canvas does, without its selection chrome", () => {
    const repositoryState = createRepositoryState();
    const item = createLayout(titleItems);

    const source = createLayoutThumbnailSource({ item, repositoryState });

    expect(source.width).toBe(1280);
    expect(source.height).toBe(720);
    expect(source.renderState).toEqual({
      elements: drawnByEditor({
        item,
        repositoryState,
        layoutType: "general",
      }),
      animations: [],
    });
    expect(source.renderState.elements[0]).toMatchObject({
      id: "layout-editor-preview-background",
      src: "file-image-1",
    });
    expect(source.settleMs).toBeUndefined();
  });

  it("fills in what the editor's Preview shows for preview data never saved, such as sample dialogue", () => {
    const repositoryState = createRepositoryState();
    const item = {
      ...createLayout({
        name: {
          id: "name",
          type: "text-ref-character-name",
          textStyleId: "style-1",
        },
        line: {
          id: "line",
          type: "text-revealing-ref-dialogue-content",
          textStyleId: "style-1",
        },
      }),
      layoutType: "dialogue-adv",
      preview: undefined,
    };

    const source = createLayoutThumbnailSource({ item, repositoryState });

    const editorElements = drawnByEditor({
      item,
      repositoryState,
      layoutType: "dialogue-adv",
    });
    // A thumbnail draws text that types itself out in full.
    const withoutRevealEffect = (elements) =>
      JSON.parse(
        JSON.stringify(elements, (key, value) =>
          key === "revealEffect" ? undefined : value,
        ),
      );
    expect(withoutRevealEffect(source.renderState.elements)).toEqual(
      withoutRevealEffect(editorElements),
    );
    expect(JSON.stringify(source.renderState.elements)).toContain(
      "This is a sample dialogue content.",
    );
  });

  it("loads the files it draws, a font typed by its file name with its weight, and no sounds", () => {
    const source = createLayoutThumbnailSource({
      item: createLayout(titleItems),
      repositoryState: createRepositoryState(),
    });

    expect(source.assets).toEqual([
      { fileId: "file-image-1", fileType: "image/webp" },
      { fileId: "file-image-2", fileType: "image/png" },
      {
        fileId: "file-font-1",
        fileType: "font/woff2",
        fontWeightDescriptor: "600",
      },
    ]);
  });

  it("draws text that types itself out in full", () => {
    const source = createLayoutThumbnailSource({
      item: createLayout({
        line: {
          id: "line",
          type: "text-revealing",
          content: [{ text: "Hello" }],
          textStyleId: "style-1",
          revealEffect: "typewriter",
        },
      }),
      repositoryState: createRepositoryState(),
    });

    expect(
      source.renderState.elements.find((element) => element.id === "line"),
    ).toMatchObject({ type: "text-revealing", revealEffect: "none" });
  });

  it("lets a layout's particles run before its thumbnail is taken", () => {
    const source = createLayoutThumbnailSource({
      item: createLayout({
        snow: { id: "snow", type: "particle", particleId: "particle-1" },
      }),
      repositoryState: createRepositoryState(),
    });

    expect(
      source.renderState.elements.some(
        (element) => element.type === "particles",
      ),
    ).toBe(true);
    expect(source.settleMs).toBe(1500);
  });

  it("draws save and load screens as one type, as the editor does", () => {
    expect(toLayoutPreviewType("save")).toBe("save-load");
    expect(toLayoutPreviewType("load")).toBe("save-load");
    expect(toLayoutPreviewType(undefined)).toBe("general");
    expect(toLayoutPreviewType("dialogue-adv")).toBe("dialogue-adv");
  });
});
