import { describe, expect, it } from "vitest";
import { buildLayoutElements } from "../../src/internal/project/layout.js";
import { applyLayoutItemFieldChange } from "../../src/internal/ui/layoutEditor/layoutEditorMutations.js";
import { getLayoutEditorItemResizeEdges } from "../../src/internal/layoutEditorElementRegistry.js";

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
});
