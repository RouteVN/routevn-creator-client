import { describe, expect, it, vi } from "vitest";
import {
  handleCanvasPanButtonClick,
  handleCanvasZoomGesture,
  handleCanvasZoomInClick,
  handleCanvasZoomOutClick,
  handleCanvasZoomResetClick,
} from "../../src/pages/layoutEditor/layoutEditor.handlers.js";

const createDeps = () => ({
  store: {
    zoomCanvasIn: vi.fn(),
    zoomCanvasOut: vi.fn(),
    resetCanvasZoom: vi.fn(),
    setCanvasZoom: vi.fn(),
    toggleCanvasPanMode: vi.fn(),
  },
  refs: { layoutEditorCanvasBackground: { centerContent: vi.fn() } },
  render: vi.fn(),
});

describe("layout editor canvas zoom handlers", () => {
  it.each([
    [handleCanvasZoomInClick, "zoomCanvasIn"],
    [handleCanvasZoomOutClick, "zoomCanvasOut"],
    [handleCanvasZoomResetClick, "resetCanvasZoom"],
    [handleCanvasPanButtonClick, "toggleCanvasPanMode"],
  ])("updates the store from a button and renders", (handler, action) => {
    const deps = createDeps();

    handler(deps);

    expect(deps.store[action]).toHaveBeenCalledOnce();
    expect(deps.render).toHaveBeenCalledOnce();
  });

  it("moves the canvas back to the middle when fitting it", () => {
    const deps = createDeps();
    deps.render.mockImplementation(() =>
      expect(
        deps.refs.layoutEditorCanvasBackground.centerContent,
      ).not.toHaveBeenCalled(),
    );

    handleCanvasZoomResetClick(deps);

    expect(
      deps.refs.layoutEditorCanvasBackground.centerContent,
    ).toHaveBeenCalledOnce();
  });

  it("stores the zoom a gesture ends on", () => {
    const deps = createDeps();

    handleCanvasZoomGesture(deps, {
      _event: { detail: { zoom: 2.37 } },
    });

    expect(deps.store.setCanvasZoom).toHaveBeenCalledWith({ zoom: 2.37 });
    expect(deps.render).toHaveBeenCalledOnce();
  });
});
