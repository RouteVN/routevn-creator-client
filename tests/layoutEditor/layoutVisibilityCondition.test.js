import { describe, expect, it } from "vitest";
import { buildLayoutElements } from "../../src/internal/project/layout.js";
import { splitVisibilityConditionFromWhen } from "../../src/internal/layoutVisibilityCondition.js";

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
