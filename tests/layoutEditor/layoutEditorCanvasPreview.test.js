import { produce } from "immer";
import { describe, expect, it, vi } from "vitest";
import * as layoutEditorStore from "../../src/pages/layoutEditor/layoutEditor.store.js";
import {
  handleLayoutEditPanelPreview,
  handleLayoutEditPanelPreviewCancel,
} from "../../src/pages/layoutEditor/layoutEditor.handlers.js";
import { EN_I18N } from "../support/i18n.js";

const TEST_CONSTANTS = {
  contextMenuItems: [],
  emptyContextMenuItems: [],
  controlContextMenuItems: [],
  controlEmptyContextMenuItems: [],
};

// The real store, bound the way components bind it.
const createHarness = () => {
  let state = layoutEditorStore.createInitialState();
  state = produce(state, (draft) => {
    draft.layout = { id: "layout-one", name: "Layout One" };
    draft.layoutData = {
      tree: [{ id: "item-1" }, { id: "item-2" }],
      items: {
        "item-1": { id: "item-1", type: "rect", x: 100, y: 50 },
        "item-2": { id: "item-2", type: "rect", x: 10, y: 10 },
      },
    };
    draft.selectedItemId = "item-1";
  });
  const store = new Proxy(
    {},
    {
      get: (_target, name) => (payload) => {
        if (name.startsWith("select")) {
          return layoutEditorStore[name]({ state }, payload);
        }
        let result;
        state = produce(state, (draft) => {
          result = layoutEditorStore[name]({ state: draft }, payload);
        });
        return result;
      },
    },
  );
  const deps = {
    store,
    render: vi.fn(),
    subject: { dispatch: vi.fn() },
  };
  const canvasItem = (itemId = "item-1") =>
    layoutEditorStore.selectViewData({
      state,
      constants: TEST_CONSTANTS,
      i18n: EN_I18N,
    }).layoutState.elements.items[itemId];
  return { deps, canvasItem, getState: () => state };
};

const previewEvent = (name, value) => ({
  _event: { detail: { name, value, formValues: {} } },
});

describe("layout editor canvas preview", () => {
  it("moves the item on the canvas without saving it", () => {
    const { deps, canvasItem, getState } = createHarness();

    handleLayoutEditPanelPreview(deps, previewEvent("x", 420));

    expect(canvasItem()).toMatchObject({ x: 420, y: 50 });
    expect(getState().layoutData.items["item-1"].x).toBe(100);
    expect(deps.subject.dispatch).not.toHaveBeenCalled();
    expect(deps.render).toHaveBeenCalledOnce();

    handleLayoutEditPanelPreview(deps, previewEvent("y", 300));
    expect(canvasItem()).toMatchObject({ x: 100, y: 300 });
  });

  it("resizes both sides on the canvas while the aspect ratio is fixed", () => {
    const { deps, canvasItem, getState } = createHarness();
    deps.store.updateSelectedItem({
      updatedItem: {
        ...getState().layoutData.items["item-1"],
        width: 400,
        height: 200,
        aspectRatioLock: 2,
      },
    });

    // The edit panel sends the previewed sizes in its form values.
    handleLayoutEditPanelPreview(deps, {
      _event: {
        detail: {
          name: "width",
          value: 600,
          linkedValues: { height: 300 },
          formValues: { width: 600, height: 300, aspectRatioLock: 2 },
        },
      },
    });

    expect(canvasItem()).toMatchObject({ width: 600, height: 300 });
    expect(getState().layoutData.items["item-1"]).toMatchObject({
      width: 400,
      height: 200,
    });
  });

  it("puts the item back when the preview is cancelled", () => {
    const { deps, canvasItem } = createHarness();
    handleLayoutEditPanelPreview(deps, previewEvent("x", 420));

    handleLayoutEditPanelPreviewCancel(deps);

    expect(canvasItem().x).toBe(100);
    expect(deps.render).toHaveBeenCalledTimes(2);
    handleLayoutEditPanelPreviewCancel(deps);
    expect(deps.render).toHaveBeenCalledTimes(2);
  });

  it("ends the preview when the item is saved or another one is selected", () => {
    const { deps, canvasItem, getState } = createHarness();

    handleLayoutEditPanelPreview(deps, previewEvent("x", 420));
    deps.store.updateSelectedItem({
      updatedItem: { ...getState().layoutData.items["item-1"], x: 420 },
    });
    expect(getState().canvasPreviewItem).toBeUndefined();
    expect(canvasItem().x).toBe(420);

    handleLayoutEditPanelPreview(deps, previewEvent("x", 600));
    deps.store.setSelectedItemId({ itemId: "item-2" });
    expect(getState().canvasPreviewItem).toBeUndefined();
    expect(canvasItem("item-1").x).toBe(420);
  });
});
