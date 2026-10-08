import { produce } from "immer";
import { describe, expect, it, vi } from "vitest";
import * as layoutEditorStore from "../../src/pages/layoutEditor/layoutEditor.store.js";
import {
  handleFileExplorerItemClick,
  handleLayoutEditorCanvasBackgroundClick,
} from "../../src/pages/layoutEditor/layoutEditor.handlers.js";

// The layout editor's real store: actions apply to the state through Immer,
// and selectors read it.
const createStore = () => {
  let state = layoutEditorStore.createInitialState();
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

  it("keeps the canvas selecting in the Preview shown when the selection clears", () => {
    const store = createStore();
    store.setSelectedItemId({ itemId: "item-1" });
    store.setRightPanelMode({ mode: "preview" });
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

  it("keeps the selection when the canvas background is pressed in Preview", () => {
    const store = createStore();
    store.setSelectedItemId({ itemId: "item-1" });
    store.pickRightPanelTab({ mode: "preview" });
    const background = {};
    const refs = { fileExplorer: { clearSelection: vi.fn() } };
    const render = vi.fn();

    handleLayoutEditorCanvasBackgroundClick(
      { store, refs, render },
      { _event: { target: background, currentTarget: background } },
    );

    expect(store.selectSelectedItemId()).toBe("item-1");
    expect(refs.fileExplorer.clearSelection).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it("selects from the Elements list in Preview and goes back to Edit", async () => {
    const store = createStore();
    store.pickRightPanelTab({ mode: "preview" });
    const render = vi.fn();

    await handleFileExplorerItemClick(
      { store, refs: {}, render },
      { _event: { detail: { itemId: "item-1" } } },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.selectSelectedItemId()).toBe("item-1");
    expect(store.getState().rightPanelMode).toBe("edit");
    expect(store.selectIsCanvasSelectionDisabled()).toBe(false);
  });
});
