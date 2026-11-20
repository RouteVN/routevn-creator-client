import { describe, expect, it } from "vitest";
import { buildLayoutElements } from "../../src/internal/project/layout.js";
import { applyLayoutItemFieldChange } from "../../src/internal/ui/layoutEditor/layoutEditorMutations.js";
import { getLayoutEditorItemResizeEdges } from "../../src/internal/layoutEditorElementRegistry.js";
import { applyCanvasItemResizeChange } from "../../src/components/layoutEditorCanvas/layoutEditorCanvas.handlers.js";

const emptyCollection = { items: {}, tree: [] };

const buildTextElement = (node) => {
  const { elements } = buildLayoutElements(
    [{ id: "text-1", text: "Hello", ...node }],
    emptyCollection,
    emptyCollection,
    emptyCollection,
    emptyCollection,
    { layoutId: "layout-1" },
  );

  return elements[0];
};

describe("layout text writing mode projection", () => {
  it.each(["vertical-rl", "vertical-lr"])(
    "projects %s text with its column length",
    (writingMode) => {
      const element = buildTextElement({
        type: "text",
        writingMode,
        height: 480,
      });

      expect(element).toMatchObject({ type: "text", writingMode, height: 480 });
      expect(element.direction).toBeUndefined();
    },
  );

  it("projects right-to-left text", () => {
    const element = buildTextElement({ type: "text", direction: "rtl" });

    expect(element.direction).toBe("rtl");
    expect(element.writingMode).toBeUndefined();
  });

  it("projects the writing mode and direction of dialogue content", () => {
    expect(
      buildTextElement({
        type: "text-revealing-ref-dialogue-content",
        writingMode: "vertical-rl",
      }),
    ).toMatchObject({ type: "text-revealing", writingMode: "vertical-rl" });
    expect(
      buildTextElement({
        type: "text-revealing-ref-dialogue-content",
        direction: "rtl",
      }),
    ).toMatchObject({ type: "text-revealing", direction: "rtl" });
  });

  it("leaves horizontal left-to-right text as it was", () => {
    const element = buildTextElement({
      type: "text",
      writingMode: "horizontal-tb",
      direction: "ltr",
    });

    expect(element.writingMode).toBeUndefined();
    expect(element.direction).toBeUndefined();
  });
});

describe("layout text writing mode editing", () => {
  const changeTextDirection = (item, value) =>
    applyLayoutItemFieldChange({ item, name: "textDirection", value });

  it.each([
    ["horizontal-ltr", {}],
    ["horizontal-rtl", { direction: "rtl" }],
    ["vertical-rl", { writingMode: "vertical-rl" }],
    ["vertical-lr", { writingMode: "vertical-lr" }],
  ])("stores %s as the fields it stands for", (choice, fields) => {
    const item = changeTextDirection(
      { id: "text-1", type: "text", writingMode: "vertical-lr" },
      choice,
    );

    expect(item).toStrictEqual({ id: "text-1", type: "text", ...fields });
  });

  it("drops a right-to-left direction when text turns vertical", () => {
    const item = changeTextDirection(
      { id: "text-1", type: "text", direction: "rtl" },
      "vertical-rl",
    );

    expect(item).toStrictEqual({
      id: "text-1",
      type: "text",
      writingMode: "vertical-rl",
    });
  });

  it("drops the wrap size of the old writing mode when it changes", () => {
    const verticalItem = changeTextDirection(
      { id: "text-1", type: "text", width: 600 },
      "vertical-rl",
    );

    expect(verticalItem.width).toBeUndefined();

    const sizedVerticalItem = { ...verticalItem, height: 400 };
    expect(changeTextDirection(sizedVerticalItem, "vertical-lr").height).toBe(
      400,
    );
    expect(
      changeTextDirection(sizedVerticalItem, "horizontal-rtl").height,
    ).toBeUndefined();
    expect(
      changeTextDirection(
        { id: "text-1", type: "text", width: 600 },
        "horizontal-rtl",
      ).width,
    ).toBe(600);
  });

  it("keeps text aligned to its start when the direction changes", () => {
    const item = {
      id: "text-1",
      type: "text",
      textStyle: { align: "left", wordWrapWidth: 300 },
    };

    const rightToLeftItem = changeTextDirection(item, "horizontal-rtl");
    expect(rightToLeftItem.textStyle).toEqual({
      align: "right",
      wordWrapWidth: 300,
    });

    expect(
      changeTextDirection(rightToLeftItem, "horizontal-ltr").textStyle.align,
    ).toBe("left");
    expect(
      changeTextDirection(
        { ...item, textStyle: { align: "center" } },
        "horizontal-rtl",
      ).textStyle.align,
    ).toBe("center");
  });

  it("keeps right-to-left text aligned to its start when it turns vertical", () => {
    const item = {
      id: "text-1",
      type: "text",
      direction: "rtl",
      textStyle: { align: "right" },
    };

    const verticalItem = changeTextDirection(item, "vertical-rl");
    expect(verticalItem.textStyle.align).toBe("left");

    expect(
      changeTextDirection(verticalItem, "horizontal-rtl").textStyle.align,
    ).toBe("right");
    expect(
      changeTextDirection(
        { id: "text-1", type: "text", textStyle: { align: "right" } },
        "vertical-rl",
      ).textStyle.align,
    ).toBe("right");
  });

  it("does not turn a height stored on horizontal text into a column length", () => {
    // Line text templates store a height that horizontal text does not use.
    const item = changeTextDirection(
      {
        id: "line-content",
        type: "text-ref-dialogue-line-content",
        width: 1640,
        height: 72,
      },
      "vertical-rl",
    );

    expect(item).toStrictEqual({
      id: "line-content",
      type: "text-ref-dialogue-line-content",
      writingMode: "vertical-rl",
    });
  });

  it("keeps conditional override alignment aligned to the start", () => {
    const item = changeTextDirection(
      {
        id: "text-1",
        type: "text",
        textStyle: { align: "left" },
        conditionalOverrides: [
          {
            when: { target: "variables.mood", op: "eq", value: "calm" },
            set: { textStyle: { align: "left" } },
          },
          {
            when: { target: "variables.mood", op: "eq", value: "tense" },
            set: { textStyle: { align: "center" }, opacity: 0.5 },
          },
          {
            when: { target: "variables.mood", op: "eq", value: "dark" },
            set: { opacity: 0.2 },
          },
        ],
      },
      "horizontal-rtl",
    );

    expect(item.textStyle.align).toBe("right");
    expect(item.conditionalOverrides.map(({ set }) => set)).toEqual([
      { textStyle: { align: "right" } },
      { textStyle: { align: "center" }, opacity: 0.5 },
      { opacity: 0.2 },
    ]);
  });

  it("resizes vertical text by its column length", () => {
    expect(
      getLayoutEditorItemResizeEdges({ type: "text", width: 300 }),
    ).toEqual(["left", "right"]);
    expect(
      getLayoutEditorItemResizeEdges({
        type: "text",
        writingMode: "vertical-rl",
        height: 400,
      }),
    ).toEqual(["top", "bottom"]);
    expect(
      getLayoutEditorItemResizeEdges({
        type: "text",
        writingMode: "vertical-rl",
      }),
    ).toEqual([]);
  });

  describe("dragging a text resize handle", () => {
    const resize = (item, { resizeEdge, x, y }) =>
      applyCanvasItemResizeChange({
        item,
        dragStartPosition: {
          x: 100,
          y: 100,
          itemStartX: item.x,
          itemStartY: item.y,
          itemStartWidth: item.width,
          itemStartHeight: item.height,
        },
        resizeEdge,
        x,
        y,
      });

    it("sets the column length of vertical text, which has no width", () => {
      const item = {
        id: "text-1",
        type: "text",
        writingMode: "vertical-rl",
        x: 40,
        y: 40,
        height: 200,
      };

      expect(resize(item, { resizeEdge: "bottom", x: 100, y: 150 })).toEqual({
        ...item,
        height: 250,
      });
      // The top handle keeps the bottom where it was.
      expect(resize(item, { resizeEdge: "top", x: 100, y: 150 })).toEqual({
        ...item,
        y: 90,
        height: 150,
      });
    });

    it("sets the width of horizontal text, which has no height", () => {
      const item = { id: "text-1", type: "text", x: 40, y: 40, width: 300 };

      expect(resize(item, { resizeEdge: "right", x: 130, y: 100 })).toEqual({
        ...item,
        width: 330,
      });
    });
  });
});
