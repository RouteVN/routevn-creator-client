import { describe, expect, it } from "vitest";
import { EN_I18N } from "../support/i18n.js";
import {
  clearCanvasPreviewItem,
  createInitialState,
  selectViewData,
  setCanvasPreviewItem,
  setSelectedItemId,
  syncRepositoryState,
} from "../../src/pages/layoutEditor/layoutEditor.store.js";

const TEST_CONSTANTS = {
  contextMenuItems: [],
  emptyContextMenuItems: [],
  controlContextMenuItems: [],
  controlEmptyContextMenuItems: [],
};

const createState = () => {
  const state = createInitialState();
  syncRepositoryState(
    { state },
    {
      projectResolution: { width: 1920, height: 1080 },
      layoutId: "layout-1",
      layout: { id: "layout-1", layoutType: "general" },
      layoutData: {
        items: { "rect-1": { type: "rect", name: "Box", x: 10, y: 20 } },
        tree: [{ id: "rect-1" }],
      },
    },
  );
  setSelectedItemId({ state }, { itemId: "rect-1" });
  return state;
};

const view = (state) =>
  selectViewData({ state, constants: TEST_CONSTANTS, i18n: EN_I18N });

describe("layoutEditor panel preview", () => {
  it("shows a popover's value on the canvas only, so the hidden Preview tab keeps its layout", () => {
    const state = createState();
    const before = view(state);
    expect(before.previewLayoutState.elements).toBe(state.layoutData);
    expect(before.layoutState.elements).toBe(state.layoutData);

    setCanvasPreviewItem(
      { state },
      { itemId: "rect-1", item: { type: "rect", name: "Box", x: 300, y: 20 } },
    );
    const during = view(state);

    expect(during.layoutState.elements.items["rect-1"].x).toBe(300);
    // The same object on every render, so the preview does not redraw while
    // the popover's value moves.
    expect(during.previewLayoutState.elements).toBe(state.layoutData);
    expect(during.previewLayoutState).toMatchObject({
      id: "layout-1",
      layoutType: "general",
    });
    expect(view(state).previewLayoutState.elements).toBe(
      during.previewLayoutState.elements,
    );

    clearCanvasPreviewItem({ state });
    expect(view(state).layoutState.elements).toBe(state.layoutData);
  });
});
