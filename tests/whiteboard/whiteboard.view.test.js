import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("whiteboard view", () => {
  it("wires touch events for dragging the minimap viewport", () => {
    const whiteboardView = readFileSync(
      new URL(
        "../../src/components/whiteboard/whiteboard.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(whiteboardView).toContain(
      "touchstart:\n        handler: handleMinimapViewportTouchStart",
    );
    expect(whiteboardView).toContain(
      "touchmove:\n        handler: handleMinimapViewportTouchMove",
    );
    expect(whiteboardView).toContain(
      "touchend:\n        handler: handleMinimapViewportTouchEnd",
    );
    expect(whiteboardView).toContain(
      "touchcancel:\n        handler: handleMinimapViewportTouchCancel",
    );
  });
});
