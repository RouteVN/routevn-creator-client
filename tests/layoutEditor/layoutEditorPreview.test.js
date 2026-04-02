import { describe, expect, it } from "vitest";
import { createLayoutEditorSelectionOverlay } from "../../src/components/layoutEditorCanvas/support/layoutEditorCanvasRender.js";
import { createLayoutEditorPreviewData } from "../../src/components/layoutEditorPreview/support/layoutEditorPreviewData.js";
import { getSystemVariableItems } from "../../src/internal/systemVariables.js";
import {
  AUTO_MODE_CONDITION_ID,
  LINE_COMPLETED_CONDITION_ID,
  SKIP_MODE_CONDITION_ID,
} from "../../src/internal/layoutConditions.js";

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
    expect(previewData.saveSlots).toEqual([]);
  });

  it("builds save/load preview slots for repeating slot containers", () => {
    const savePreviewData = createLayoutEditorPreviewData({
      layoutType: "save",
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
    const loadPreviewData = createLayoutEditorPreviewData({
      layoutType: "load",
      saveLoadData: {
        slots: [
          {
            id: "slot-1",
            saveImageId: "image-3",
            saveDate: "2026-03-12 18:00",
          },
        ],
      },
    });

    expect(savePreviewData.saveSlots).toHaveLength(2);
    expect(savePreviewData.saveSlots[0]).toMatchObject({
      slotId: 1,
      image: "image-1",
      savedAt: expect.any(Number),
    });
    expect(loadPreviewData.saveSlots[0]).toMatchObject({
      slotId: 1,
      image: "image-3",
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

  it("includes fixed runtime state in preview data", () => {
    const previewData = createLayoutEditorPreviewData({
      previewVariableValues: {
        [AUTO_MODE_CONDITION_ID]: true,
        [LINE_COMPLETED_CONDITION_ID]: true,
        [SKIP_MODE_CONDITION_ID]: true,
      },
    });

    expect(previewData.isLineCompleted).toBe(true);
    expect(previewData.autoMode).toBe(true);
    expect(previewData.skipMode).toBe(true);
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

    expect(previewData.isLineCompleted).toBe(true);
    expect(previewData.autoMode).toBe(true);
    expect(previewData.skipMode).toBe(true);
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
