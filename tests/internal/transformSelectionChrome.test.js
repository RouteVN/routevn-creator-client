import { describe, expect, it } from "vitest";
import {
  createTransformSelectionAnchor,
  createTransformSelectionResizeHandle,
} from "../../src/internal/transformSelectionChrome.js";

describe("transformSelectionChrome", () => {
  it("positions anchor markers from normalized anchor values", () => {
    expect(
      createTransformSelectionAnchor({
        id: "anchor",
        width: 200,
        height: 100,
        anchorX: 0.5,
        anchorY: 0.5,
        size: 8,
        fill: { color: "#fff" },
      }),
    ).toMatchObject({
      x: 96,
      y: 46,
      width: 8,
      height: 8,
    });
  });

  it("creates a draggable resize strip on the requested edge", () => {
    expect(
      createTransformSelectionResizeHandle({
        id: "right",
        width: 200,
        height: 100,
        edge: "right",
        size: 12,
        fill: { alpha: 0 },
      }),
    ).toMatchObject({
      x: 194,
      y: 0,
      width: 12,
      height: 100,
      hover: { cursor: "ew-resize" },
    });
  });

  it("points the resize cursor the way a rotated edge moves", () => {
    const cursorFor = (edge, rotation) =>
      createTransformSelectionResizeHandle({
        id: edge,
        width: 200,
        height: 100,
        edge,
        size: 12,
        fill: { alpha: 0 },
        rotation,
      }).hover.cursor;

    expect(cursorFor("right", 0)).toBe("ew-resize");
    expect(cursorFor("bottom", 0)).toBe("ns-resize");
    expect(cursorFor("right", 90)).toBe("ns-resize");
    expect(cursorFor("left", -90)).toBe("ns-resize");
    expect(cursorFor("top", 90)).toBe("ew-resize");
    expect(cursorFor("right", 45)).toBe("nwse-resize");
    expect(cursorFor("right", 135)).toBe("nesw-resize");
    expect(cursorFor("bottom", 40)).toBe("nesw-resize");
    expect(cursorFor("right", 200)).toBe("ew-resize");
  });
});
