import { describe, expect, it, vi } from "vitest";
import {
  createBackgroundTransformEditorCanvasState,
  createBackgroundTransformEditorPositionPreviewCanvasState,
  createProjectDataWithBackgroundTransformEditor,
  selectBackgroundTransformEditorRenderedBounds,
} from "../../src/internal/ui/sceneEditor/backgroundTransformEditor.js";

describe("backgroundTransformEditor", () => {
  it("moves the rendered target directly for a transient position preview", () => {
    const canvasState =
      createBackgroundTransformEditorPositionPreviewCanvasState({
        renderState: {
          id: "scene-editor",
          elements: [
            {
              id: "bg-cg-background-sprite",
              type: "rect",
              x: 10,
              y: 20,
              width: 1920,
              height: 1080,
            },
          ],
        },
        graphicsService: {
          parse: ({ elements }) => ({ elements }),
        },
        editorState: {
          background: { resourceId: "background-sprite" },
          transform: { x: 197, y: 174 },
        },
        startTransform: { x: 100, y: 120 },
      });

    expect(canvasState.renderState.elements[0]).toMatchObject({
      id: "bg-cg-background-sprite",
      x: 107,
      y: 74,
      originX: 960,
      originY: 540,
    });
    expect(canvasState.renderState.elements[1]).toMatchObject({
      id: "selected-border-group",
      x: 1067,
      y: 614,
    });
  });

  it("uses RouteGraphics world bounds for the background selection", () => {
    const renderedBounds = {
      x: -960,
      y: -540,
      width: 1920,
      height: 1080,
      corners: [
        { x: -960, y: -540 },
        { x: 960, y: -540 },
        { x: 960, y: 540 },
        { x: -960, y: 540 },
      ],
    };
    const hitTestElementBounds = vi.fn(() => [
      {
        path: [
          {
            id: "bg-cg-background-sprite",
            bounds: renderedBounds,
          },
        ],
      },
    ]);

    expect(
      selectBackgroundTransformEditorRenderedBounds({
        graphicsService: { hitTestElementBounds },
        editorState: {
          background: { resourceId: "background-sprite" },
        },
        projectResolution: { width: 1920, height: 1080 },
      }),
    ).toBe(renderedBounds);
    expect(hitTestElementBounds).toHaveBeenCalledWith({ x: 1, y: 1 });
  });

  it("previews background movement with the same inline transform saved on Done", () => {
    const projectData = {
      resources: {
        transforms: {},
      },
      story: {
        scenes: {
          "scene-1": {
            sections: {
              "section-1": {
                lines: [
                  {
                    id: "line-1",
                    actions: {
                      background: {
                        resourceId: "title-layout",
                        transformId: "old-transform",
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    };

    const previewProjectData = createProjectDataWithBackgroundTransformEditor(
      projectData,
      {
        sceneId: "scene-1",
        sectionId: "section-1",
        lineId: "line-1",
      },
      {
        isOpen: true,
        targetType: "background",
        transform: {
          x: 320,
          y: 180,
          anchorX: 0.5,
          anchorY: 0.5,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          originX: 960,
          originY: 540,
        },
      },
    );
    const previewBackground =
      previewProjectData.story.scenes["scene-1"].sections["section-1"].lines[0]
        .actions.background;

    expect(previewBackground).toMatchObject({
      resourceId: "title-layout",
      x: 320,
      y: 180,
      originX: 960,
      originY: 540,
    });
    expect(previewBackground).not.toHaveProperty("transformId");
    expect(previewProjectData.resources.transforms).not.toHaveProperty(
      "__background_transform_editor__",
    );
    expect(
      projectData.story.scenes["scene-1"].sections["section-1"].lines[0].actions
        .background.transformId,
    ).toBe("old-transform");
  });

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
      fill: "#ffffff",
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
            rotation: 15,
            scaleX: 2,
            scaleY: 2,
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

    expect(canvasState.renderState.elements[0]).toMatchObject({
      originX: 100,
      originY: 50,
    });

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
      renderedX: 10,
      renderedY: 20,
      renderedOriginX: 100,
      renderedOriginY: 50,
      renderedRotation: 15,
      renderedScaleX: 2,
      renderedScaleY: 2,
    });
  });

  it("uses the canvas bounds to select and drag a layout background", () => {
    const canvasState = createBackgroundTransformEditorCanvasState({
      renderState: {
        elements: [
          {
            id: "story",
            type: "container",
            children: [
              {
                id: "bg-cg-background-color",
                type: "rect",
                width: 1920,
                height: 1080,
              },
              {
                id: "bg-cg-background-container",
                type: "container",
                x: 20,
                y: 30,
                children: [
                  {
                    id: "title",
                    type: "text",
                    width: 300,
                    height: 80,
                  },
                ],
              },
            ],
          },
        ],
      },
      graphicsService: {
        parse: ({ elements }) => ({ elements }),
      },
      editorState: {
        background: {
          resourceId: "title-layout",
        },
      },
    });

    const overlay = canvasState.renderState.elements[0].children[2];
    const selectionGroup = overlay;
    const hitArea = selectionGroup.children[0];

    expect(canvasState.renderState.id).toBe(
      "scene-editor:action-transform:background:bg-cg-background-sprite,bg-cg-background-video,bg-cg-background-container,bg-cg-title-layout:0,0,0.5,0.5,1,1,0,0,0",
    );
    expect(selectionGroup).toMatchObject({
      id: "selected-border-group",
      width: 1920,
      height: 1080,
    });
    expect(hitArea).toMatchObject({
      id: "selected-border",
      x: 4,
      y: 4,
      width: 1912,
      height: 1072,
      hover: { cursor: "all-scroll" },
      drag: {
        start: { payload: {} },
        move: { payload: {} },
        end: { payload: {} },
      },
    });
    expect(canvasState.selectedElementMetrics).toMatchObject({
      width: 1920,
      height: 1080,
    });
  });
});
