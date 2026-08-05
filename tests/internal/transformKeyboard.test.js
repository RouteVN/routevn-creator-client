import { describe, expect, it } from "vitest";
import {
  applyTransformPositionIntent,
  createTransformKeyboardIntent,
  isTransformArrowKey,
} from "../../src/internal/transformKeyboard.js";

describe("transformKeyboard", () => {
  it("maps arrow keys to normal and fast move intents", () => {
    expect(isTransformArrowKey("ArrowLeft")).toBe(true);
    expect(isTransformArrowKey("Enter")).toBe(false);
    expect(
      createTransformKeyboardIntent({ key: "ArrowLeft", shiftKey: true }),
    ).toEqual({
      type: "move",
      axis: "x",
      delta: -10,
    });
  });

  it("applies move intents without changing unrelated transform fields", () => {
    expect(
      applyTransformPositionIntent(
        { x: 10, y: 20, scaleX: 2 },
        { type: "move", axis: "y", delta: 1 },
      ),
    ).toEqual({ x: 10, y: 21, scaleX: 2 });
  });
});
