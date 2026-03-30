import { describe, expect, it } from "vitest";
import { buildLayoutElements } from "../../src/internal/project/layout.js";
import {
  LINE_COMPLETED_CONDITION_ID,
  SAVE_DATA_AVAILABLE_CONDITION_ID,
  buildVisibilityConditionExpression,
  splitVisibilityConditionFromWhen,
} from "../../src/internal/layoutVisibilityCondition.js";

describe("layout visibility conditions", () => {
  it("compiles a structured visibility condition into $when", () => {
    const { elements } = buildLayoutElements(
      [
        {
          id: "rect-1",
          type: "rect",
          visibilityCondition: {
            variableId: "score",
            op: "eq",
            value: 10,
          },
        },
      ],
      {},
      { items: {}, tree: [] },
      { items: {}, tree: [] },
      { items: {}, tree: [] },
      { layoutId: "layout-1" },
    );

    expect(elements[0].$when).toBe('variables["score"] == 10');
  });

  it("combines a visibility condition with an existing $when", () => {
    const { elements } = buildLayoutElements(
      [
        {
          id: "rect-1",
          type: "rect",
          $when: "dialogue.character.name",
          visibilityCondition: {
            variableId: "flag-enabled",
            op: "eq",
            value: true,
          },
        },
      ],
      {},
      { items: {}, tree: [] },
      { items: {}, tree: [] },
      { items: {}, tree: [] },
      { layoutId: "layout-1" },
    );

    expect(elements[0].$when).toBe(
      '(dialogue.character.name) && (variables["flag-enabled"] == true)',
    );
  });

  it("extracts a saved visibility condition from $when", () => {
    expect(
      splitVisibilityConditionFromWhen(
        '(line.characterName) && (variables["flag-enabled"] == true)',
      ),
    ).toEqual({
      baseWhen: "line.characterName",
      visibilityCondition: {
        variableId: "flag-enabled",
        op: "eq",
        value: true,
      },
    });
  });

  it("compiles save data availability visibility into item.date checks", () => {
    const { elements } = buildLayoutElements(
      [
        {
          id: "rect-1",
          type: "rect",
          visibilityCondition: {
            variableId: SAVE_DATA_AVAILABLE_CONDITION_ID,
            op: "eq",
            value: false,
          },
        },
      ],
      {},
      { items: {}, tree: [] },
      { items: {}, tree: [] },
      { items: {}, tree: [] },
      { layoutId: "layout-1" },
    );

    expect(elements[0].$when).toBe("!item.date");
  });

  it("extracts save data availability visibility from $when", () => {
    expect(splitVisibilityConditionFromWhen("(line.characterName) && (!item.date)")).toEqual({
      baseWhen: "line.characterName",
      visibilityCondition: {
        variableId: SAVE_DATA_AVAILABLE_CONDITION_ID,
        op: "eq",
        value: false,
      },
    });
  });

  it("compiles fixed runtime visibility into flat template data access", () => {
    expect(
      buildVisibilityConditionExpression({
        variableId: LINE_COMPLETED_CONDITION_ID,
        op: "eq",
        value: true,
      }),
    ).toBe("isLineCompleted == true");
  });

  it("extracts fixed runtime visibility from $when", () => {
    expect(
      splitVisibilityConditionFromWhen(
        '(line.characterName) && (isLineCompleted == true)',
      ),
    ).toEqual({
      baseWhen: "line.characterName",
      visibilityCondition: {
        variableId: LINE_COMPLETED_CONDITION_ID,
        op: "eq",
        value: true,
      },
    });
  });

  it("builds save/load slot containers against the engine saveSlots contract", () => {
    const { elements } = buildLayoutElements(
      [
        {
          id: "slot-container",
          type: "container-ref-save-load-slot",
          name: "Container (Save/Load Slot)",
          children: [
            {
              id: "slot-image",
              type: "sprite-ref-save-load-slot-image",
            },
            {
              id: "slot-date",
              type: "text-ref-save-load-slot-date",
            },
          ],
        },
      ],
      {},
      { items: {}, tree: [] },
      { items: {}, tree: [] },
      { items: {}, tree: [] },
      {
        layoutId: "layout-save",
        layoutType: "save",
      },
    );

    expect(elements[0].$each).toBe("item, i in saveSlots");
    expect(elements[0].click).toEqual({
      payload: {
        actions: {
          saveSaveSlot: {
            slot: "${item.slotNumber}",
          },
        },
      },
    });
    expect(elements[0].children).toEqual([
      expect.objectContaining({
        id: "slot-image-instance-${i}",
        type: "sprite",
        imageId: "${item.image}",
      }),
      expect.objectContaining({
        id: "slot-date-instance-${i}",
        type: "text",
        content: "${item.date}",
      }),
    ]);
  });

  it("merges custom click actions with save/load slot actions", () => {
    const { elements } = buildLayoutElements(
      [
        {
          id: "slot-container",
          type: "container-ref-save-load-slot",
          click: {
            payload: {
              actions: {
                toggleDialogueUI: {},
              },
            },
          },
        },
      ],
      {},
      { items: {}, tree: [] },
      { items: {}, tree: [] },
      { items: {}, tree: [] },
      {
        layoutId: "layout-save",
        layoutType: "save",
      },
    );

    expect(elements[0].click).toEqual({
      payload: {
        actions: {
          toggleDialogueUI: {},
          saveSaveSlot: {
            slot: "${item.slotNumber}",
          },
        },
      },
    });
  });

  it("expands fragment references into container children", () => {
    const { elements } = buildLayoutElements(
      [
        {
          id: "fragment-ref-1",
          type: "fragment-ref",
          name: "Fragment Ref",
          x: 10,
          y: 20,
          width: 100,
          height: 100,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          fragmentLayoutId: "layout-fragment",
        },
      ],
      {},
      { items: {}, tree: [] },
      { items: {}, tree: [] },
      { items: {}, tree: [] },
      {
        layoutId: "layout-1",
        layoutsData: {
          "layout-fragment": {
            id: "layout-fragment",
            type: "layout",
            name: "Fragment",
            layoutType: "normal",
            isFragment: true,
            elements: {
              items: {
                "fragment-text": {
                  id: "fragment-text",
                  type: "text",
                  name: "Fragment Text",
                  x: 4,
                  y: 8,
                  width: 120,
                  height: 24,
                  anchorX: 0,
                  anchorY: 0,
                  scaleX: 1,
                  scaleY: 1,
                  rotation: 0,
                  text: "Hello from fragment",
                },
              },
              tree: [{ id: "fragment-text" }],
            },
          },
        },
      },
    );

    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe("container");
    expect(elements[0].id).toBe("fragment-ref-1");
    expect(elements[0].children).toEqual([
      expect.objectContaining({
        id: "fragment-ref-1--fragment-text",
        type: "text",
        text: "Hello from fragment",
      }),
    ]);
  });
});
