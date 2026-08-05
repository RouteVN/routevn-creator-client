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
});
