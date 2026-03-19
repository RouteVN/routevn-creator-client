import { describe, expect, it } from "vitest";
import {
  applyLayoutItemDragChange,
  applyLayoutItemFieldChange,
  applyLayoutItemKeyboardChange,
} from "../../src/internal/layoutEditorMutations.js";

describe("layoutEditorMutations", () => {
  it("updates nested fields without replacing sibling data", () => {
    const item = {
      id: "text-1",
      type: "text",
      text: "Hello",
      style: {
        align: "left",
        wordWrapWidth: 300,
      },
    };

    const updatedItem = applyLayoutItemFieldChange({
      item,
      name: "style.align",
      value: "center",
    });

    expect(updatedItem.style).toEqual({
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

  it("binds slider variables through the shared mutation path", () => {
    const item = {
      id: "slider-1",
      type: "slider",
      min: 5,
      variableId: "",
    };

    const updatedItem = applyLayoutItemFieldChange({
      item,
      name: "variableId",
      value: "volume",
    });

    expect(updatedItem.variableId).toBe("volume");
    expect(updatedItem.initialValue).toBe("${variables.volume}");
    expect(
      updatedItem.change.payload.actions.updateVariable.operations,
    ).toEqual([
      {
        variableId: "volume",
        op: "set",
        value: "_event.value",
      },
    ]);
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
      applyLayoutItemKeyboardChange({
        item,
        key: "ArrowLeft",
        unit: 3,
      }),
    ).toMatchObject({
      x: 47,
      width: 100,
    });

    expect(
      applyLayoutItemKeyboardChange({
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

    const updatedItem = applyLayoutItemDragChange({
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
});
