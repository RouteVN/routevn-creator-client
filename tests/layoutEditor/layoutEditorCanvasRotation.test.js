import { describe, expect, it } from "vitest";
import {
  calculateLayoutEditorRotationDragUpdate,
  createLayoutEditorRotationDragStart,
  resolveLayoutEditorRotationPivotFromBounds,
} from "../../src/components/layoutEditorCanvas/support/layoutEditorCanvasRotation.js";

const pointAtDegrees = (degrees) => {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: Math.cos(radians),
    y: Math.sin(radians),
  };
};

describe("layout editor canvas rotation", () => {
  it("crosses the angle boundary without snapping backwards", () => {
    const startPoint = pointAtDegrees(179);
    const dragStart = createLayoutEditorRotationDragStart({
      ...startPoint,
      pivotX: 0,
      pivotY: 0,
      itemRotation: 10,
    });
    const nextPoint = pointAtDegrees(-179);

    expect(
      calculateLayoutEditorRotationDragUpdate({
        dragStart,
        ...nextPoint,
      }),
    ).toMatchObject({
      rotationDelta: 2,
      rotation: 12,
    });
  });

  it("accumulates smooth rotation beyond one full turn", () => {
    const startPoint = pointAtDegrees(0);
    const dragStart = createLayoutEditorRotationDragStart({
      ...startPoint,
      pivotX: 0,
      pivotY: 0,
      itemRotation: 0,
    });
    const firstUpdate = calculateLayoutEditorRotationDragUpdate({
      dragStart,
      ...pointAtDegrees(170),
    });
    const secondUpdate = calculateLayoutEditorRotationDragUpdate({
      dragStart: {
        ...dragStart,
        pointerAngle: firstUpdate.pointerAngle,
        rotationDelta: firstUpdate.rotationDelta,
      },
      ...pointAtDegrees(-170),
    });
    const thirdUpdate = calculateLayoutEditorRotationDragUpdate({
      dragStart: {
        ...dragStart,
        pointerAngle: secondUpdate.pointerAngle,
        rotationDelta: secondUpdate.rotationDelta,
      },
      ...pointAtDegrees(0),
    });

    expect(thirdUpdate.rotation).toBe(360);
  });

  it("rounds drag rotation to two decimals", () => {
    const dragStart = createLayoutEditorRotationDragStart({
      ...pointAtDegrees(0),
      pivotX: 0,
      pivotY: 0,
      itemRotation: 0,
    });

    const update = calculateLayoutEditorRotationDragUpdate({
      dragStart,
      ...pointAtDegrees(12.34567),
    });

    expect(update.rotation).toBe(12.35);
  });

  it("recovers the rendered anchor pivot from the centered hit area", () => {
    const pivot = resolveLayoutEditorRotationPivotFromBounds({
      bounds: {
        corners: [
          { x: 108, y: 192 },
          { x: 108, y: 208 },
          { x: 92, y: 208 },
          { x: 92, y: 192 },
        ],
      },
    });

    expect(pivot).toEqual({ x: 100, y: 200 });
  });
});
