// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createBackgroundTransformEditorCanvasState } from "../../src/internal/ui/sceneEditor/backgroundTransformEditor.js";

let graphicsService;

beforeAll(async () => {
  // The graphics bundle also imports audio workers; parsing uses no workers.
  vi.stubGlobal("Worker", class {});
  const { containerPlugin, rectPlugin, spritePlugin } = await import(
    "route-graphics"
  );
  const parserPlugins = [containerPlugin, rectPlugin, spritePlugin];
  graphicsService = {
    parse: ({ elements }) => ({
      elements: elements.map((state) =>
        parserPlugins
          .find((plugin) => plugin.type === state.type)
          .parse({ state, parserPlugins }),
      ),
    }),
  };
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const findElement = (elements, id) => {
  for (const element of elements) {
    if (element.id === id) return element;
    const child = findElement(element.children ?? [], id);
    if (child) return child;
  }
};

describe.each(["background", "visual", "character"])(
  "%s transform selection geometry",
  (targetType) => {
    it.each([
      [0.5, 0.5],
      [2, 2],
      [1.5, 0.75],
      [-2, 0.5],
      [0.5, -2],
    ])("matches the rendered target at scale %s, %s", (scaleX, scaleY) => {
      const targetId = {
        background: "bg-cg-background-sprite",
        visual: "visual-image-one",
        character: "character-container-character-one",
      }[targetType];
      const target = {
        id: targetId,
        type: "sprite",
        src: "image-one",
        width: 200,
        height: 120,
        x: 300,
        y: 200,
        anchorX: 0.5,
        anchorY: 0.5,
        rotation: 30,
        scaleX,
        scaleY,
      };
      if (targetType === "character") {
        target.type = "container";
        delete target.src;
        delete target.width;
        delete target.height;
        target.children = [
          {
            id: "character-sprite",
            type: "sprite",
            src: "image-one",
            width: 200,
            height: 120,
          },
        ];
      }
      const renderState = {
        elements: [
          {
            id: "story",
            type: "container",
            width: 1000,
            height: 750,
            children: [
              {
                id: "layer",
                type: "container",
                x: 35,
                y: 20,
                scaleX: 1.25,
                scaleY: 0.8,
                rotation: 15,
                children: [target],
              },
            ],
          },
        ],
      };
      const canvasState = createBackgroundTransformEditorCanvasState({
        renderState,
        graphicsService,
        canvasUnitsPerCssPixel: 3,
        editorState: {
          targetType,
          targetId,
          transform: { anchorX: 0.5, anchorY: 0.5, scaleX, scaleY },
        },
      });
      const { elements } = graphicsService.parse(canvasState.renderState);
      const image = findElement(elements, targetId);
      const overlay = findElement(elements, "selected-border-group");
      const border = findElement(elements, "selected-border");
      const rightHandle = findElement(elements, "selected-border-resize-right");
      const bottomHandle = findElement(
        elements,
        "selected-border-resize-bottom",
      );
      const anchor = findElement(elements, "selected-border-anchor");

      // Compare dimensions after the actual renderer parser has processed both
      // the resource and its selection, including inherited container scaling.
      expect(border.width + 8).toBe(image.width);
      expect(border.height + 8).toBe(image.height);
      expect(rightHandle.x + rightHandle.width / 2).toBe(image.width);
      expect(bottomHandle.y + bottomHandle.height / 2).toBe(image.height);
      expect(rightHandle.width / 3).toBe(12);
      expect(bottomHandle.height / 3).toBe(12);
      expect(anchor.x + anchor.width / 2).toBe(Math.round(image.width / 2));
      expect(anchor.y + anchor.height / 2).toBe(Math.round(image.height / 2));
      for (const field of ["x", "y", "originX", "originY", "rotation"]) {
        expect(overlay[field]).toBe(image[field]);
      }
      expect(Math.sign(overlay.scaleX)).toBe(Math.sign(image.scaleX));
      expect(Math.sign(overlay.scaleY)).toBe(Math.sign(image.scaleY));
    });
  },
);
