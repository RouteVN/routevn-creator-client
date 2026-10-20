import { produce } from "immer";
import { describe, expect, it, vi } from "vitest";
import * as layoutEditorStore from "../../src/pages/layoutEditor/layoutEditor.store.js";
import {
  handleFileExplorerItemClick,
  handleLayoutEditorCanvasBackgroundClick,
  handleMobilePanelModeChange,
  handleRightPanelModeChange,
} from "../../src/pages/layoutEditor/layoutEditor.handlers.js";
import { EN_I18N } from "../support/i18n.js";

// The layout editor's real store: actions apply to the state through Immer,
// and selectors read it. The layout has one element, "item-1".
const createStore = () => {
  let state = layoutEditorStore.createInitialState();
  state.layoutData = {
    tree: [{ id: "item-1" }],
    items: { "item-1": { id: "item-1", type: "rect", name: "Item One" } },
  };
  const store = { getState: () => state };
  for (const [name, fn] of Object.entries(layoutEditorStore)) {
    if (name === "createInitialState" || typeof fn !== "function") {
      continue;
    }
    store[name] = name.startsWith("select")
      ? (payload) => fn({ state }, payload)
      : (payload) => {
          state = produce(state, (draft) => {
            fn({ state: draft }, payload);
          });
        };
  }
  return store;
};

// The page's refs, and the view data its template reads.
const createPage = (store) => ({
  refs: { fileExplorer: { clearSelection: vi.fn(), selectItem: vi.fn() } },
  view: () =>
    layoutEditorStore.selectViewData({
      state: store.getState(),
      constants: {
        contextMenuItems: [],
        emptyContextMenuItems: [],
        controlContextMenuItems: [],
        controlEmptyContextMenuItems: [],
      },
      i18n: EN_I18N,
    }),
});

const selectItem = (store, itemId) => {
  store.setSelectedItemId({ itemId });
  store.setDetailPanelSelectedItemId({ itemId });
};

const pickTab = (store, refs, id) =>
  handleRightPanelModeChange(
    { store, refs, render: vi.fn() },
    { _event: { detail: { id } } },
  );

const useTouch = (store, { width, height }) => {
  store.setUiConfig({ uiConfig: { inputMode: "touch" } });
  store.setAppWindowMetrics({ width, height });
};

describe("layout editor Preview canvas selection", () => {
  it("turns canvas selection off in a Preview picked from its tab, where the right panel shows", () => {
    const store = createStore();
    expect(store.selectIsCanvasSelectionDisabled()).toBe(false);

    store.pickRightPanelTab({ mode: "preview" });
    expect(store.selectIsCanvasSelectionDisabled()).toBe(true);

    useTouch(store, { width: 1194, height: 834 });
    expect(store.selectIsCanvasSelectionDisabled()).toBe(true);

    // A phone has no right panel, so no Edit or Preview tabs.
    useTouch(store, { width: 390, height: 844 });
    expect(store.selectIsCanvasSelectionDisabled()).toBe(false);
  });

  it("keeps a picked Preview locked until Edit shows", () => {
    const store = createStore();
    store.pickRightPanelTab({ mode: "preview" });
    store.setRightPanelMode({ mode: "preview" });
    expect(store.selectIsCanvasSelectionDisabled()).toBe(true);

    store.setRightPanelMode({ mode: "edit" });
    store.setRightPanelMode({ mode: "preview" });
    expect(store.selectIsCanvasSelectionDisabled()).toBe(false);

    store.pickRightPanelTab({ mode: "preview" });
    store.pickRightPanelTab({ mode: "edit" });
    expect(store.selectIsCanvasSelectionDisabled()).toBe(false);
  });

  it("does nothing when the canvas background is pressed in Preview", () => {
    const store = createStore();
    const { refs } = createPage(store);
    pickTab(store, refs, "preview");
    refs.fileExplorer.clearSelection.mockClear();
    const render = vi.fn();
    const background = {};

    handleLayoutEditorCanvasBackgroundClick(
      { store, refs, render },
      { _event: { target: background, currentTarget: background } },
    );

    expect(refs.fileExplorer.clearSelection).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it("selects from the Elements list in Preview and goes back to Edit", async () => {
    const store = createStore();
    const { refs } = createPage(store);
    pickTab(store, refs, "preview");
    const render = vi.fn();

    await handleFileExplorerItemClick(
      { store, refs, render },
      { _event: { detail: { itemId: "item-1" } } },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.selectSelectedItemId()).toBe("item-1");
    expect(store.getState().rightPanelMode).toBe("edit");
    expect(store.selectDetailPanelSelectedItemId()).toBe("item-1");
    expect(store.selectIsCanvasSelectionDisabled()).toBe(false);
  });
});

describe("layout editor Edit and Preview selection", () => {
  it("keeps Edit and clears the selection when empty canvas is pressed in Edit", () => {
    const store = createStore();
    const { refs, view } = createPage(store);
    selectItem(store, "item-1");
    const render = vi.fn();
    const background = {};

    handleLayoutEditorCanvasBackgroundClick(
      { store, refs, render },
      { _event: { target: background, currentTarget: background } },
    );

    expect(view().rightPanelMode).toBe("edit");
    expect(view().rightPanelEditStyle).toBe("");
    expect(view().selectedItemId).toBeUndefined();
    expect(view().detailPanelSelectedItemId).toBeUndefined();
    expect(refs.fileExplorer.clearSelection).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("clears the selection when Preview is picked and shows nothing selected back in Edit", () => {
    const store = createStore();
    const { refs, view } = createPage(store);
    selectItem(store, "item-1");

    pickTab(store, refs, "preview");

    expect(view().rightPanelMode).toBe("preview");
    expect(view().selectedItemId).toBeUndefined();
    expect(view().detailPanelSelectedItemId).toBeUndefined();
    expect(refs.fileExplorer.clearSelection).toHaveBeenCalledTimes(1);

    pickTab(store, refs, "edit");

    expect(view().rightPanelMode).toBe("edit");
    expect(view().selectedItemId).toBeUndefined();
    expect(view().detailPanelSelectedItemId).toBeUndefined();
    expect(refs.fileExplorer.clearSelection).toHaveBeenCalledTimes(1);
  });

  it("clears the selection when the phone panel shows Preview and opens the Elements list back in Edit", () => {
    const store = createStore();
    const { refs, view } = createPage(store);
    useTouch(store, { width: 390, height: 844 });
    selectItem(store, "item-1");
    expect(view().showMobileSelectedNodeDetail).toBe(true);
    expect(view().mobilePanelMode).toBe("edit");
    const chooseMobileTab = (id) =>
      handleMobilePanelModeChange(
        { store, refs, render: vi.fn() },
        { _event: { detail: { id } } },
      );

    chooseMobileTab("preview");

    expect(view().mobilePanelMode).toBe("preview");
    expect(view().showMobileSelectedNodeDetail).toBe(false);
    expect(view().selectedItemId).toBeUndefined();
    expect(view().detailPanelSelectedItemId).toBeUndefined();
    expect(refs.fileExplorer.clearSelection).toHaveBeenCalledTimes(1);

    chooseMobileTab("edit");

    expect(view().mobilePanelMode).toBe("edit");
    expect(view().showMobileNodeExplorer).toBe(true);
    expect(view().showMobileSelectedNodeDetail).toBe(false);
    expect(view().selectedItemId).toBeUndefined();
  });
});
