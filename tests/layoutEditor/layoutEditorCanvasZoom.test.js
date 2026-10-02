import { describe, expect, it, vi } from "vitest";
import {
  handleCanvasPanButtonClick,
  handleCanvasZoomInClick,
  handleCanvasZoomResetClick,
} from "../../src/pages/layoutEditor/layoutEditor.handlers.js";
import { keepViewportCenter } from "../../src/pages/layoutEditor/support/layoutEditorCanvasZoom.js";

// A scroll container 400x300 whose content is `zoom` times 800x600.
const createViewport = () => {
  const viewport = {
    zoom: 1,
    clientWidth: 400,
    clientHeight: 300,
    scrollLeft: 0,
    scrollTop: 0,
    get scrollWidth() {
      return Math.max(this.clientWidth, 800 * this.zoom);
    },
    get scrollHeight() {
      return Math.max(this.clientHeight, 600 * this.zoom);
    },
  };
  return viewport;
};

describe("layout editor canvas zoom", () => {
  it("keeps the point in view centered while the content resizes", () => {
    const viewport = createViewport();
    viewport.scrollLeft = 100;
    viewport.scrollTop = 50;

    keepViewportCenter(viewport, () => {
      viewport.zoom = 2;
    });

    // The center was (300, 200) of 800x600 and is (600, 400) of 1600x1200.
    expect(viewport.scrollLeft).toBe(400);
    expect(viewport.scrollTop).toBe(250);
  });

  it("centers the content when it grows past a viewport it fit in", () => {
    const viewport = createViewport();
    viewport.zoom = 0.5;

    keepViewportCenter(viewport, () => {
      viewport.zoom = 1;
    });

    expect(viewport.scrollLeft).toBe(200);
    expect(viewport.scrollTop).toBe(150);
  });

  it("zooms from the buttons around the viewport center", () => {
    const viewport = createViewport();
    // Scrolled so the middle of the 800x600 content is in view.
    viewport.scrollLeft = 200;
    viewport.scrollTop = 150;
    const store = {
      zoomCanvasIn: vi.fn(() => {
        viewport.zoom = 2;
      }),
      resetCanvasZoom: vi.fn(() => {
        viewport.zoom = 1;
      }),
    };
    const render = vi.fn();
    const deps = {
      store,
      render,
      refs: { layoutEditorCanvasBackground: viewport },
    };

    handleCanvasZoomInClick(deps);
    expect(store.zoomCanvasIn).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
    expect([viewport.scrollLeft, viewport.scrollTop]).toEqual([600, 450]);

    handleCanvasZoomResetClick(deps);
    expect(store.resetCanvasZoom).toHaveBeenCalledOnce();
    expect([viewport.scrollLeft, viewport.scrollTop]).toEqual([200, 150]);
  });

  it("toggles pan mode and renders", () => {
    const deps = {
      store: { toggleCanvasPanMode: vi.fn() },
      render: vi.fn(),
    };

    handleCanvasPanButtonClick(deps);

    expect(deps.store.toggleCanvasPanMode).toHaveBeenCalledOnce();
    expect(deps.render).toHaveBeenCalledOnce();
  });
});
