import { describe, expect, it } from "vitest";
import {
  createLayoutEditorPreviewData,
  createLayoutEditorSelectionOverlay,
} from "../../src/internal/layoutEditorPreview.js";
import { getSystemVariableItems } from "../../src/internal/systemVariables.js";

describe("layoutEditorPreview", () => {
  it("builds stable preview data from variables, dialogue defaults, and choices", () => {
    const previewData = createLayoutEditorPreviewData({
      variablesData: {
        items: {
          numberVar: { type: "number", value: "7" },
          boolVar: { type: "boolean", value: "true" },
          folder: { type: "folder" },
        },
      },
      dialogueDefaultValues: {
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
      _dialogueTextSpeed: 50,
    });
    expect(previewData.dialogue.character.name).toBe("Aki");
    expect(previewData.dialogue.content[0].text).toBe("Hello there");
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
        characterName: "Aki",
        content: [{ text: "First NVL line" }],
      },
      {
        content: [{ text: "Second NVL line" }],
      },
    ]);
  });

  it("includes system variables in preview data", () => {
    const previewData = createLayoutEditorPreviewData({
      variablesData: {
        items: {},
      },
    });
    const [firstSystemVariableId] = Object.keys(getSystemVariableItems());

    expect(firstSystemVariableId).toBeTruthy();
    expect(previewData.variables).toHaveProperty(firstSystemVariableId);
  });

  it("overrides preview variables with edited values", () => {
    const previewData = createLayoutEditorPreviewData({
      variablesData: {
        items: {
          score: { type: "number", default: 1 },
          enabled: { type: "boolean", default: false },
        },
      },
      previewVariableValues: {
        score: 42,
        enabled: true,
      },
    });

    expect(previewData.variables).toMatchObject({
      score: 42,
      enabled: true,
    });
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
    expect(overlays[0].id).toBe("selected-border");
    expect(overlays[0].drag).toEqual({
      start: { payload: {} },
      move: { payload: {} },
      end: { payload: {} },
    });
  });
});
