import { describe, expect, it } from "vitest";
import {
  createLayoutEditorRenderedElements,
  createLayoutEditorSelectionOverlay,
} from "../../src/components/layoutEditorCanvas/support/layoutEditorCanvasRender.js";
import { createLayoutEditorPreviewData } from "../../src/components/layoutEditorPreview/support/layoutEditorPreviewData.js";
import { getRuntimeFieldItems } from "../../src/internal/runtimeFields.js";
import {
  AUTO_MODE_CONDITION_TARGET,
  LINE_COMPLETED_CONDITION_TARGET,
  SKIP_MODE_CONDITION_TARGET,
} from "../../src/internal/layoutConditions.js";

describe("layoutEditorPreview", () => {
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
    expect(overlays[0].children).toHaveLength(6);
    expect(overlays[0].children[0].id).toBe("selected-border");
    expect(overlays[0].children[0].x).toBe(0);
    expect(overlays[0].children[0].y).toBe(0);
    expect(overlays[0].children[0].drag).toEqual({
      start: { payload: {} },
      move: { payload: {} },
      end: { payload: {} },
    });
    expect(overlays[0].children[5]).toEqual({
      id: "selected-border-anchor",
      type: "rect",
      x: 46,
      y: 16,
      width: 8,
      height: 8,
      fill: {
        color: "#ffffff",
        alpha: 1,
      },
      border: {
        color: "#111111",
        width: 1,
        alpha: 1,
      },
    });
  });

  it("does not add resize handles for container items without size controls", () => {
    const overlays = createLayoutEditorSelectionOverlay({
      selectedItemId: "choice-item",
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
      "selected-border",
      "selected-border-anchor",
    ]);
  });

  it("does not add resize handles for auto-width text items", () => {
    const overlays = createLayoutEditorSelectionOverlay({
      selectedItemId: "text-item",
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
      "selected-border",
      "selected-border-anchor",
    ]);
  });
});
