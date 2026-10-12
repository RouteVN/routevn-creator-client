import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";
import { parseAndRender } from "jempl";
import * as handlers from "../../src/components/actionTransformEditor/actionTransformEditor.handlers.js";
import {
  createInitialState,
  selectViewData,
} from "../../src/components/actionTransformEditor/actionTransformEditor.store.js";

const DESKTOP = { isTouchMode: false, isTouchLandscape: false };
const TOUCH_PORTRAIT = { isTouchMode: true, isTouchLandscape: false };
const TOUCH_LANDSCAPE = { isTouchMode: true, isTouchLandscape: true };

const loadView = () =>
  yaml.load(
    readFileSync(
      new URL(
        "../../src/components/actionTransformEditor/actionTransformEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    ),
  );

const renderTemplate = (layoutState) => {
  const view = loadView();
  const viewData = selectViewData({
    state: { ...createInitialState(), ...layoutState },
    props: {},
  });

  return parseAndRender(view.template, viewData);
};

// A rendered node is an object with one key, its element selector, which maps
// to its children.
const selectorOf = (node) => Object.keys(node)[0];
const childrenOf = (node) => Object.values(node)[0];

const findNodes = (nodes, selectorText) =>
  nodes.flatMap((node) => {
    const matches = selectorOf(node).includes(selectorText) ? [node] : [];
    const children = childrenOf(node);

    return Array.isArray(children)
      ? [...matches, ...findNodes(children, selectorText)]
      : matches;
  });

const selectOnly = (rendered, selectorText) => {
  const nodes = findNodes(rendered, selectorText);
  expect(nodes).toHaveLength(1);

  return nodes[0];
};

const selectHeaderChildren = (rendered) =>
  childrenOf(childrenOf(rendered[0])[0]);

const selectWorkspaceChildren = (rendered) =>
  childrenOf(selectOnly(rendered, "#actionTransformWorkspace"));

const selectCanvasAreaChildren = (rendered) =>
  childrenOf(selectOnly(rendered, "#actionTransformCanvasArea"));

const selectZoomViewport = (rendered) =>
  selectOnly(rendered, "rvn-zoom-viewport#actionTransformCanvasBackground");

const indexOfCanvasArea = (rendered) =>
  selectWorkspaceChildren(rendered).findIndex((child) =>
    selectorOf(child).includes("#actionTransformCanvasArea"),
  );

const indexOfCanvasBackground = (rendered) =>
  selectCanvasAreaChildren(rendered).findIndex((child) =>
    selectorOf(child).includes("#actionTransformCanvasBackground"),
  );

describe("actionTransformEditor view", () => {
  it.each([
    ["desktop", DESKTOP],
    ["touch portrait", TOUCH_PORTRAIT],
    ["touch landscape", TOUCH_LANDSCAPE],
  ])(
    "uses layout-editor canvas framing in the %s layout",
    (_name, layoutState) => {
      const template = JSON.stringify(renderTemplate(layoutState));

      expect(template).toContain("#actionTransformCanvasBackground");
      expect(template).toContain(
        "background-image: radial-gradient(circle, var(--input) 1px, transparent 1px)",
      );
      expect(template).toContain("background-size: 24px 24px");
      expect(template).toContain(
        "#actionTransformCanvasFrame w=f bwl=xs bwr=xs bc=bo",
      );
      expect(template).toContain(
        "rvn-scene-editor-preview-canvas#actionTransformCanvasHost",
      );
    },
  );

  it("keeps the inspector in the resizable right panel only in touch landscape", () => {
    const portrait = renderTemplate(TOUCH_PORTRAIT);
    const landscape = renderTemplate(TOUCH_LANDSCAPE);
    const inspector = "rvn-layout-edit-panel#transformInspector";

    // The inspector is rendered once in either layout, so its ref and its
    // events do not double up.
    expect(findNodes(portrait, inspector)).toHaveLength(1);
    expect(findNodes(landscape, inspector)).toHaveLength(1);

    expect(findNodes(portrait, "rvn-resizable-panel")).toHaveLength(0);

    const landscapePanels = findNodes(landscape, "rvn-resizable-panel");
    expect(landscapePanels).toHaveLength(1);
    expect(selectorOf(landscapePanels[0])).toContain(
      "panel-type=transform-editor",
    );
    expect(findNodes(childrenOf(landscapePanels[0]), inspector)).toHaveLength(
      1,
    );
  });

  it("stacks the inspector under the canvas in touch portrait and puts it beside the canvas in touch landscape", () => {
    const inspector = "rvn-layout-edit-panel#transformInspector";
    const portrait = renderTemplate(TOUCH_PORTRAIT);
    const landscape = renderTemplate(TOUCH_LANDSCAPE);

    // Under the canvas: the canvas area holds the viewport, then the inspector.
    const portraitArea = selectCanvasAreaChildren(portrait);
    expect(portraitArea).toHaveLength(2);
    expect(selectorOf(portraitArea[0])).toContain(
      "rvn-zoom-viewport#actionTransformCanvasBackground",
    );
    expect(findNodes([portraitArea[1]], inspector)).toHaveLength(1);
    expect(selectWorkspaceChildren(portrait)).toHaveLength(1);

    // Beside the canvas: the canvas area holds the viewport alone, and the
    // panel with the inspector follows the area in the workspace's row.
    const landscapeArea = selectCanvasAreaChildren(landscape);
    expect(landscapeArea).toHaveLength(1);
    expect(selectorOf(landscapeArea[0])).toContain(
      "rvn-zoom-viewport#actionTransformCanvasBackground",
    );
    expect(findNodes(landscapeArea, inspector)).toHaveLength(0);
    const landscapeWorkspace = selectWorkspaceChildren(landscape);
    expect(landscapeWorkspace).toHaveLength(2);
    expect(selectorOf(landscapeWorkspace[0])).toContain(
      "#actionTransformCanvasArea",
    );
    expect(selectorOf(landscapeWorkspace[1])).toContain("rvn-resizable-panel");
  });

  it("lays the workspace out in a row, and the canvas area in a column to size the canvas from, in every layout", () => {
    for (const layoutState of [DESKTOP, TOUCH_PORTRAIT, TOUCH_LANDSCAPE]) {
      const rendered = renderTemplate(layoutState);

      expect(
        selectorOf(selectOnly(rendered, "#actionTransformWorkspace")),
      ).toContain(" d=h ");
      const canvasArea = selectorOf(
        selectOnly(rendered, "#actionTransformCanvasArea"),
      );
      expect(canvasArea).toContain(" d=v ");
      expect(canvasArea).toContain("container-type: size");
    }
  });

  it("keeps the canvas at the same place in the workspace in touch portrait and touch landscape", () => {
    const portrait = renderTemplate(TOUCH_PORTRAIT);
    const landscape = renderTemplate(TOUCH_LANDSCAPE);

    // Moving the panel must not move the canvas among its siblings, or the
    // canvas is remounted when a tablet rotates. That holds for the canvas
    // area among the workspace's children, and for the viewport among the
    // canvas area's.
    expect(indexOfCanvasArea(portrait)).toBeGreaterThanOrEqual(0);
    expect(indexOfCanvasArea(landscape)).toBe(indexOfCanvasArea(portrait));
    expect(indexOfCanvasBackground(portrait)).toBeGreaterThanOrEqual(0);
    expect(indexOfCanvasBackground(landscape)).toBe(
      indexOfCanvasBackground(portrait),
    );
  });

  it("draws one canvas host inside the canvas background in every layout", () => {
    for (const layoutState of [DESKTOP, TOUCH_PORTRAIT, TOUCH_LANDSCAPE]) {
      const rendered = renderTemplate(layoutState);
      const [canvasBackground] = findNodes(
        rendered,
        "#actionTransformCanvasBackground",
      );

      expect(
        findNodes(
          rendered,
          "rvn-scene-editor-preview-canvas#actionTransformCanvasHost",
        ),
      ).toHaveLength(1);
      expect(
        findNodes(
          childrenOf(canvasBackground),
          "rvn-scene-editor-preview-canvas#actionTransformCanvasHost",
        ),
      ).toHaveLength(1);
    }
  });

  it("adds the target column before the canvas area only on desktop", () => {
    const desktop = renderTemplate(DESKTOP);
    const desktopChildren = selectWorkspaceChildren(desktop);

    expect(desktopChildren).toHaveLength(3);
    expect(selectorOf(desktopChildren[0])).toContain("w=220");
    expect(indexOfCanvasArea(desktop)).toBe(1);
    expect(selectorOf(desktopChildren[2])).toContain("rvn-resizable-panel");
    expect(findNodes(desktop, "w=220")).toHaveLength(1);

    for (const layoutState of [TOUCH_PORTRAIT, TOUCH_LANDSCAPE]) {
      expect(findNodes(renderTemplate(layoutState), "w=220")).toHaveLength(0);
    }
  });

  describe("canvas zoom", () => {
    it.each([
      ["desktop", DESKTOP],
      ["touch landscape", TOUCH_LANDSCAPE],
    ])(
      "zooms the canvas from the header buttons and by gesture in the %s layout",
      (_name, layoutState) => {
        const rendered = renderTemplate(layoutState);
        const header = selectHeaderChildren(rendered);

        expect(
          findNodes(header, "rtgl-button#canvasZoomOutButton"),
        ).toHaveLength(1);
        const reset = selectOnly(header, "rtgl-button#canvasZoomResetButton");
        expect(childrenOf(reset)).toBe("100%");
        expect(
          findNodes(header, "rtgl-button#canvasZoomInButton"),
        ).toHaveLength(1);
        expect(selectorOf(selectZoomViewport(rendered))).toContain(
          "zoom=1 ?gestures=true",
        );
      },
    );

    it("fits the canvas without zoom buttons or gestures in the touch portrait layout", () => {
      // Even when the editor kept a zoom from a landscape layout.
      const rendered = renderTemplate({ ...TOUCH_PORTRAIT, canvasZoom: 2 });

      expect(findNodes(rendered, "canvasZoom")).toHaveLength(0);
      expect(selectorOf(selectZoomViewport(rendered))).toContain(
        "zoom=1 ?gestures=false",
      );
    });

    it.each([
      [2, "200%", { zoomIn: false, zoomOut: false }],
      [10, "1000%", { zoomIn: true, zoomOut: false }],
      [0.1, "10%", { zoomIn: false, zoomOut: true }],
    ])(
      "shows a zoom of %s in the viewport and on the fit button, and disables a button at the end of its range",
      (canvasZoom, label, disabled) => {
        const rendered = renderTemplate({ ...DESKTOP, canvasZoom });

        expect(selectorOf(selectZoomViewport(rendered))).toContain(
          `zoom=${canvasZoom} `,
        );
        expect(
          childrenOf(selectOnly(rendered, "rtgl-button#canvasZoomResetButton")),
        ).toBe(label);
        expect(
          selectorOf(selectOnly(rendered, "rtgl-button#canvasZoomInButton")),
        ).toContain(`?disabled=${disabled.zoomIn}`);
        expect(
          selectorOf(selectOnly(rendered, "rtgl-button#canvasZoomOutButton")),
        ).toContain(`?disabled=${disabled.zoomOut}`);
      },
    );

    it("places the canvas by the viewport's zoom and pan where it zooms, and fits it where the inspector is under it", () => {
      for (const layoutState of [DESKTOP, TOUCH_LANDSCAPE]) {
        const viewport = selectZoomViewport(renderTemplate(layoutState));
        const [wrapper] = childrenOf(viewport);

        expect(selectorOf(viewport)).toContain("overflow: hidden");
        expect(selectorOf(wrapper)).toContain("position: absolute");
        expect(selectorOf(wrapper)).toContain("var(--canvas-zoom, 1)");
        expect(
          findNodes(childrenOf(wrapper), "#actionTransformCanvasFrame"),
        ).toHaveLength(1);
      }

      const viewport = selectZoomViewport(renderTemplate(TOUCH_PORTRAIT));
      const [wrapper] = childrenOf(viewport);

      expect(selectorOf(viewport)).not.toContain("overflow: hidden");
      expect(selectorOf(wrapper)).toContain("position: relative");
      expect(selectorOf(wrapper)).not.toContain("--canvas-zoom");
      expect(
        findNodes(childrenOf(wrapper), "#actionTransformCanvasFrame"),
      ).toHaveLength(1);
    });

    it("wires the zoom buttons, the viewport's zoom-change and the canvas's pointercancel to handlers", () => {
      const { refs } = loadView();

      expect(refs).toMatchObject({
        canvasZoomOutButton: {
          eventListeners: { click: { handler: "handleCanvasZoomOutClick" } },
        },
        canvasZoomResetButton: {
          eventListeners: { click: { handler: "handleCanvasZoomResetClick" } },
        },
        canvasZoomInButton: {
          eventListeners: { click: { handler: "handleCanvasZoomInClick" } },
        },
        actionTransformCanvasBackground: {
          eventListeners: {
            "zoom-change": { handler: "handleCanvasZoomGesture" },
          },
        },
        actionTransformCanvasHost: {
          eventListeners: {
            pointercancel: { handler: "handleCanvasPointerCancel" },
          },
        },
      });
      for (const name of [
        "canvasZoomOutButton",
        "canvasZoomResetButton",
        "canvasZoomInButton",
        "actionTransformCanvasBackground",
        "actionTransformCanvasHost",
      ]) {
        for (const { handler } of Object.values(refs[name].eventListeners)) {
          expect(handlers[handler]).toBeTypeOf("function");
        }
      }
    });
  });

  it("wires the inspector's update, preview and preview-cancel events to handlers", () => {
    const { eventListeners } = loadView().refs.transformInspector;

    expect(eventListeners).toMatchObject({
      update: { handler: "handleInspectorUpdate" },
      preview: { handler: "handleInspectorPreview" },
      "preview-cancel": { handler: "handleInspectorPreviewCancel" },
    });
    for (const { handler } of Object.values(eventListeners)) {
      expect(handlers[handler]).toBeTypeOf("function");
    }
  });

  it("leaves canvas pointer interaction to the graphics selection chrome", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/actionTransformEditor/actionTransformEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain(
      "rvn-scene-editor-preview-canvas#actionTransformCanvasHost",
    );
    expect(view).not.toContain("backgroundDragSurface");
    expect(view).not.toContain("handler: handleBackgroundPointerDown");
  });
});
