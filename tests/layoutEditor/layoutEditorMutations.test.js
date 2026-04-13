import { describe, expect, it } from "vitest";
import { applyLayoutItemFieldChange } from "../../src/pages/layoutEditor/support/layoutEditorMutations.js";
import {
  applyCanvasItemDragChange,
  applyCanvasItemKeyboardChange,
  applyCanvasItemResizeChange,
} from "../../src/components/layoutEditorCanvas/layoutEditorCanvas.handlers.js";

describe("layoutEditorMutations", () => {
  it("updates nested fields without replacing sibling data", () => {
    const item = {
      id: "text-1",
      type: "text",
      text: "Hello",
      textStyle: {
        align: "left",
        wordWrapWidth: 300,
      },
    };

    const updatedItem = applyLayoutItemFieldChange({
      item,
      name: "textStyle.align",
      value: "center",
    });

    expect(updatedItem.textStyle).toEqual({
      align: "center",
      wordWrapWidth: 300,
    });
  });

  it("maps anchor updates to anchorX and anchorY", () => {
    const item = {
      id: "container-1",
      type: "container",
      anchorX: 0,
      anchorY: 0,
    };

    const updatedItem = applyLayoutItemFieldChange({
      item,
      name: "anchor",
      value: { x: 0.5, y: 1 },
    });

    expect(updatedItem.anchorX).toBe(0.5);
    expect(updatedItem.anchorY).toBe(1);
  });

  it("keeps cleared container direction unset in saved data", () => {
    const item = {
      id: "choice-container-1",
      type: "container-ref-choice-item",
      direction: "vertical",
    };

    const updatedItem = applyLayoutItemFieldChange({
      item,
      name: "direction",
      value: undefined,
    });

    expect(updatedItem.direction).toBeUndefined();
  });

  it("normalizes opacity to the allowed 0..1 range", () => {
    const item = {
      id: "rect-1",
      type: "rect",
      opacity: 1,
    };

    const lowOpacityItem = applyLayoutItemFieldChange({
      item,
      name: "opacity",
      value: -0.5,
    });
    const highOpacityItem = applyLayoutItemFieldChange({
      item,
      name: "opacity",
      value: 1.5,
    });
    const clearedOpacityItem = applyLayoutItemFieldChange({
      item,
      name: "opacity",
      value: null,
    });

    expect(lowOpacityItem.opacity).toBe(0);
    expect(highOpacityItem.opacity).toBe(1);
    expect(clearedOpacityItem.opacity).toBeUndefined();
  });

  it("auto-sizes sprites from the selected image when width and height are unset", () => {
    const item = {
      id: "sprite-1",
      type: "sprite",
      imageId: "image-1",
      width: 0,
      height: 0,
    };

    const updatedItem = applyLayoutItemFieldChange({
      item,
      name: "imageId",
      value: "image-1",
      imagesData: {
        items: {
          "image-1": {
            width: 320,
            height: 180,
          },
        },
      },
    });

    expect(updatedItem.width).toBe(320);
    expect(updatedItem.height).toBe(180);
  });

  it("applies keyboard moves and resizes as explicit item intents", () => {
    const item = {
      id: "rect-1",
      type: "rect",
      x: 50,
      y: 70,
      width: 100,
      height: 40,
    };

    expect(
      applyCanvasItemKeyboardChange({
        item,
        key: "ArrowLeft",
        unit: 3,
      }),
    ).toMatchObject({
      x: 47,
      width: 100,
    });

    expect(
      applyCanvasItemKeyboardChange({
        item,
        key: "ArrowDown",
        unit: 5,
        resize: true,
      }),
    ).toMatchObject({
      y: 70,
      height: 45,
    });
  });

  it("applies drag movement from the captured drag origin", () => {
    const item = {
      id: "rect-1",
      type: "rect",
      x: 10,
      y: 20,
    };

    const updatedItem = applyCanvasItemDragChange({
      item,
      dragStartPosition: {
        x: 100,
        y: 150,
        itemStartX: 10,
        itemStartY: 20,
      },
      x: 118,
      y: 170,
    });

    expect(updatedItem).toMatchObject({
      x: 28,
      y: 40,
    });
  });

  it("does not resize container items when size controls are unavailable", () => {
    const item = {
      id: "choice-container-1",
      type: "container-ref-choice-item",
      x: 10,
      y: 20,
      width: 100,
      height: 40,
    };

    expect(
      applyCanvasItemResizeChange({
        item,
        dragStartPosition: {
          x: 100,
          y: 100,
          itemStartX: 10,
          itemStartY: 20,
          itemStartWidth: 100,
          itemStartHeight: 40,
        },
        resizeEdge: "right",
        x: 130,
        y: 100,
      }),
    ).toBe(item);
  });

  it("does not keyboard-resize auto-width text items", () => {
    const item = {
      id: "text-1",
      type: "text",
      x: 10,
      y: 20,
      width: undefined,
      height: 40,
    };

    expect(
      applyCanvasItemKeyboardChange({
        item,
        key: "ArrowRight",
        unit: 5,
        resize: true,
      }),
    ).toBe(item);
  });
});
