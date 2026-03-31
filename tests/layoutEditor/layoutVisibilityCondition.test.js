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

  it("compiles save data availability visibility into item.savedAt checks", () => {
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

    expect(elements[0].$when).toBe("!item.savedAt");
  });

  it("extracts save data availability visibility from $when", () => {
    expect(
      splitVisibilityConditionFromWhen(
        "(line.characterName) && (!item.savedAt)",
      ),
    ).toEqual({
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

  it("compiles ordered conditional text styles into jempl $if overrides", () => {
    const { elements } = buildLayoutElements(
      [
        {
          id: "text-1",
          type: "text",
          name: "Label",
          x: 0,
          y: 0,
          width: 100,
          height: 20,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          text: "Hello",
          textStyleId: "base-style",
          conditionalTextStyles: [
            {
              variableId: "score",
              op: "eq",
              value: 10,
              textStyleId: "score-style",
            },
            {
              variableId: LINE_COMPLETED_CONDITION_ID,
              op: "eq",
              value: true,
              textStyleId: "completed-style",
            },
          ],
        },
      ],
      {},
      {
        items: {
          "base-style": {
            id: "base-style",
            type: "textStyle",
            fontId: "font-1",
            colorId: "color-1",
          },
          "score-style": {
            id: "score-style",
            type: "textStyle",
            fontId: "font-1",
            colorId: "color-1",
          },
          "completed-style": {
            id: "completed-style",
            type: "textStyle",
            fontId: "font-1",
            colorId: "color-1",
          },
        },
        tree: [],
      },
      { items: {}, tree: [] },
      { items: {}, tree: [] },
      { items: {}, tree: [] },
      { layoutId: "layout-1" },
    );

    expect(elements[0]).toMatchObject({
      '$if variables["score"] == 10': {
        textStyleId: "score-style",
      },
      "$if isLineCompleted == true": {
        textStyleId: "completed-style",
      },
    });
  });

  it("extracts fixed runtime visibility from $when", () => {
    expect(
      splitVisibilityConditionFromWhen(
        "(line.characterName) && (isLineCompleted == true)",
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
        _event: {
          slotId: "${item.slotId}",
        },
        actions: {
          saveSaveSlot: {
            slot: "_event.slotId",
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
        content: "${formatDate(item.savedAt)}",
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
        _event: {
          slotId: "${item.slotId}",
        },
        actions: {
          toggleDialogueUI: {},
          saveSaveSlot: {
            slot: "_event.slotId",
          },
        },
      },
    });
  });

  it("compiles child interaction inheritance for containers", () => {
    const { elements } = buildLayoutElements(
      [
        {
          id: "container-1",
          type: "container",
          name: "Container",
          inheritHoverToChildren: true,
          inheritClickToChildren: true,
          inheritRightClickToChildren: true,
        },
      ],
      {},
      { items: {}, tree: [] },
      { items: {}, tree: [] },
      { items: {}, tree: [] },
      { layoutId: "layout-1" },
    );

    expect(elements[0].hover).toEqual({
      inheritToChildren: true,
    });
    expect(elements[0].click).toEqual({
      inheritToChildren: true,
    });
    expect(elements[0].rightClick).toEqual({
      inheritToChildren: true,
    });
  });

  it("preserves click actions when child interaction inheritance is enabled", () => {
    const { elements } = buildLayoutElements(
      [
        {
          id: "container-1",
          type: "container",
          name: "Container",
          inheritClickToChildren: true,
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
      { layoutId: "layout-1" },
    );

    expect(elements[0].click).toEqual({
      inheritToChildren: true,
      payload: {
        actions: {
          toggleDialogueUI: {},
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
