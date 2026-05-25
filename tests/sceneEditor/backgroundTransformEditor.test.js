import { describe, expect, it } from "vitest";
import { createBackgroundTransformEditorCanvasState } from "../../src/internal/ui/sceneEditor/backgroundTransformEditor.js";

describe("backgroundTransformEditor", () => {
  it("adds an origin marker to the selected background overlay", () => {
    const canvasState = createBackgroundTransformEditorCanvasState({
      renderState: {
        elements: [
          {
            id: "bg-cg-background-sprite",
            type: "rect",
            x: 10,
            y: 20,
            width: 100,
            height: 40,
            originX: 50,
            originY: 20,
          },
        ],
      },
      graphicsService: {
        parse: ({ elements }) => ({ elements }),
      },
      editorState: {
        background: {
          resourceId: "background-sprite",
        },
      },
    });

    const overlay = canvasState.renderState.elements[1];

    expect(overlay.id).toBe("selected-border-group");
    expect(overlay.children.map((child) => child.id)).toEqual([
      "selected-border",
      "selected-border-resize-left",
      "selected-border-resize-right",
      "selected-border-resize-top",
      "selected-border-resize-bottom",
      "selected-border-anchor",
    ]);
    expect(overlay.children[5]).toEqual({
      id: "selected-border-anchor",
      type: "rect",
      x: 46,
      y: 16,
      width: 8,
      height: 8,
      fill: {
        color: "#ffffff",
        alpha: 1,
      },
      border: {
        color: "#111111",
        width: 1,
        alpha: 1,
      },
    });
  });

  it("uses transform anchor ratios for the marker and resize metrics", () => {
    const canvasState = createBackgroundTransformEditorCanvasState({
      renderState: {
        elements: [
          {
            id: "bg-cg-background-sprite",
            type: "rect",
            x: 10,
            y: 20,
            width: 200,
            height: 100,
            originX: 50,
            originY: 25,
          },
        ],
      },
      graphicsService: {
        parse: ({ elements }) => ({ elements }),
      },
      editorState: {
        background: {
          resourceId: "background-sprite",
        },
        transform: {
          anchorX: 0.5,
          anchorY: 0.5,
          scaleX: 2,
          scaleY: 2,
        },
      },
    });

    const overlay = canvasState.renderState.elements[1];

    expect(overlay.children[5]).toMatchObject({
      id: "selected-border-anchor",
      x: 96,
      y: 46,
    });
    expect(canvasState.selectedElementMetrics).toEqual({
      width: 200,
      height: 100,
      anchorX: 0.5,
      anchorY: 0.5,
      scaleX: 2,
      scaleY: 2,
    });
  });
});
