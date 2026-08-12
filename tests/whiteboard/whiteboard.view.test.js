import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("whiteboard view", () => {
  it("uses the subtle border token around the minimap", () => {
    const whiteboardView = readFileSync(
      new URL(
        "../../src/components/whiteboard/whiteboard.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(whiteboardView).toContain(
      "rtgl-view#minimapContainer pos=abs z=100 ah=c p=md bgc=mu bw=xs bc=bo",
    );
    expect(whiteboardView).toContain(
      'style="${minimapContainerStyle}; box-sizing: border-box;"',
    );
  });

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
