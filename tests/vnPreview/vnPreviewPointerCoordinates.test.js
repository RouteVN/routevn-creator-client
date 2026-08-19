import { describe, expect, it } from "vitest";
import {
  mapRotatedPreviewClientPoint,
  remapRotatedPreviewPointerEvent,
} from "../../src/components/vnPreview/support/vnPreviewPointerCoordinates.js";

const ROTATED_CANVAS_RECT = {
  left: 100,
  top: 50,
  width: 360,
  height: 640,
};

describe("vnPreview rotated pointer coordinates", () => {
  it("maps the rotated display corners back to the landscape canvas axes", () => {
    expect(
      mapRotatedPreviewClientPoint(
        { clientX: 100, clientY: 50 },
        ROTATED_CANVAS_RECT,
      ),
    ).toEqual({ clientX: 100, clientY: 690 });
    expect(
      mapRotatedPreviewClientPoint(
        { clientX: 460, clientY: 50 },
        ROTATED_CANVAS_RECT,
      ),
    ).toEqual({ clientX: 100, clientY: 50 });
    expect(
      mapRotatedPreviewClientPoint(
        { clientX: 100, clientY: 690 },
        ROTATED_CANVAS_RECT,
      ),
    ).toEqual({ clientX: 460, clientY: 690 });
    expect(
      mapRotatedPreviewClientPoint(
        { clientX: 460, clientY: 690 },
        ROTATED_CANVAS_RECT,
      ),
    ).toEqual({ clientX: 460, clientY: 50 });
  });

  it("keeps the center fixed while swapping and reversing the axes", () => {
    expect(
      mapRotatedPreviewClientPoint(
        { clientX: 280, clientY: 370 },
        ROTATED_CANVAS_RECT,
      ),
    ).toEqual({ clientX: 280, clientY: 370 });
  });

  it("resolves a rotated tap to the original renderer-space coordinate", () => {
    const mappedPoint = mapRotatedPreviewClientPoint(
      { clientX: 370, clientY: 530 },
      ROTATED_CANVAS_RECT,
    );
    const rendererPoint = {
      x:
        ((mappedPoint.clientX - ROTATED_CANVAS_RECT.left) * 1920) /
        ROTATED_CANVAS_RECT.width,
      y:
        ((mappedPoint.clientY - ROTATED_CANVAS_RECT.top) * 1080) /
        ROTATED_CANVAS_RECT.height,
    };

    expect(rendererPoint).toEqual({ x: 1440, y: 270 });
  });

  it("updates native event coordinates before Route Graphics receives them", () => {
    const event = {
      clientX: 460,
      clientY: 50,
    };

    expect(remapRotatedPreviewPointerEvent(event, ROTATED_CANVAS_RECT)).toBe(
      true,
    );
    expect(event).toMatchObject({
      clientX: 100,
      clientY: 50,
    });
  });

  it("ignores invalid or zero-size canvas bounds", () => {
    expect(
      mapRotatedPreviewClientPoint(
        { clientX: 100, clientY: 50 },
        { ...ROTATED_CANVAS_RECT, width: 0 },
      ),
    ).toBeUndefined();
  });
});
