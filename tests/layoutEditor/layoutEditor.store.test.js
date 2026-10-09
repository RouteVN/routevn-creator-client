import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import { EN_I18N } from "../support/i18n.js";
import {
  createInitialState,
  selectViewData,
  syncRepositoryState,
  setLayout,
  setSelectedItemId,
  setDetailPanelSelectedItemId,
  openMobileFileExplorer,
  setRightPanelMode,
  setAppWindowMetrics,
  selectIsTabletLandscape,
  setPreviewData,
  selectUnsavedPreviewData,
  markPreviewDataEdited,
  markPreviewDataSaved,
  setUiConfig,
  setPendingPersistPayload,
  clearPendingPersistPayload,
  resetCanvasZoom,
  setCanvasZoom,
  zoomCanvasIn,
  zoomCanvasOut,
} from "../../src/pages/layoutEditor/layoutEditor.store.js";

const TEST_CONSTANTS = {
  contextMenuItems: [
    {
      label: "Container",
      type: "item",
      createType: "container",
    },
    {
      $when: 'layoutType == "save-load"',
      label: "Container (Save/Load Slot)",
      type: "item",
      createType: "container-save-load-slot",
    },
  ],
  emptyContextMenuItems: [
    {
      $when: 'layoutType == "save-load"',
      label: "Container (Save/Load Slot)",
      type: "item",
      createType: "container-save-load-slot",
    },
  ],
  controlContextMenuItems: [],
  controlEmptyContextMenuItems: [],
};

const LAYOUT_EDITOR_CONSTANTS_URL = new URL(
  "../../src/pages/layoutEditor/layoutEditor.constants.yaml",
  import.meta.url,
);
const LAYOUT_EDITOR_CONSTANTS = yaml.load(
  readFileSync(LAYOUT_EDITOR_CONSTANTS_URL, "utf8"),
);

describe("layoutEditor.store", () => {
  it.each(["layouts", "controls"])(
    "preserves the latest unsaved position when an older %s save is reconciled",
    (resourceType) => {
      const state = createInitialState();
      const committedItem = Object.freeze({ type: "rect", x: 10, y: 0 });
      const layoutData = {
        items: Object.freeze({ "item-one": committedItem }),
        tree: [{ id: "item-one" }],
      };
      const payload = {
        projectResolution: { width: 1920, height: 1080 },
        layoutId: "layout-one",
        resourceType,
        layoutData,
      };
      const updatedItem = { type: "rect", x: 20, y: 0 };
      setPendingPersistPayload(
        { state },
        {
          payload: {
            layoutId: "layout-one",
            resourceType,
            selectedItemId: "item-one",
            updatedItem,
            persistenceRequestId: "save-two",
          },
        },
      );

      syncRepositoryState({ state }, payload);
      clearPendingPersistPayload(
        { state },
        { persistenceRequestId: "save-one" },
      );
      expect(state.layoutData.items["item-one"].x).toBe(20);
      expect(layoutData.items["item-one"].x).toBe(10);
      expect(state.pendingPersistPayload.updatedItem).toEqual(updatedItem);

      clearPendingPersistPayload(
        { state },
        { persistenceRequestId: "save-two" },
      );
      syncRepositoryState({ state }, payload);
      expect(state.layoutData.items["item-one"].x).toBe(10);
    },
  );

  it.each([
    { layoutId: "layout-two", resourceType: "layouts" },
    { layoutId: "layout-one", resourceType: "controls" },
  ])("does not carry a pending drag into another owner: %j", (owner) => {
    const state = createInitialState();
    setPendingPersistPayload(
      { state },
      {
        payload: {
          layoutId: "layout-one",
          resourceType: "layouts",
          selectedItemId: "item-one",
          updatedItem: { type: "rect", x: 20, y: 0 },
        },
      },
    );
    syncRepositoryState(
      { state },
      {
        ...owner,
        projectResolution: { width: 1920, height: 1080 },
        layoutData: {
          items: { "item-one": { type: "rect", x: 10, y: 0 } },
          tree: [{ id: "item-one" }],
        },
      },
    );
    expect(state.layoutData.items["item-one"].x).toBe(10);
  });

  it("marks selected descendants of hidden parents as effectively hidden", () => {
    const state = createInitialState();

    syncRepositoryState(
      { state },
      {
        projectResolution: { width: 1920, height: 1080 },
        layoutId: "layout-1",
        layout: {
          id: "layout-1",
          layoutType: "general",
        },
        layoutData: {
          items: {
            "folder-1": {
              type: "folder",
              name: "Group",
              hidden: true,
            },
            "text-1": {
              type: "text",
              name: "Title",
            },
          },
          tree: [
            {
              id: "folder-1",
              children: [{ id: "text-1" }],
            },
          ],
        },
      },
    );
    setSelectedItemId({ state }, { itemId: "text-1" });

    const viewData = selectViewData({
      state,
      constants: TEST_CONSTANTS,
      i18n: EN_I18N,
    });

    expect(viewData.selectedItemIsEffectivelyHidden).toBe(true);
    expect(
      viewData.flatItems.find((item) => item.id === "text-1"),
    ).toMatchObject({
      hidden: false,
      effectivelyHidden: true,
      textColor: "mu-fg",
    });
  });

  it("normalizes a legacy save layout to save-load", () => {
    const state = createInitialState();

    setLayout(
      { state },
      {
        id: "layout-save",
        layout: {
          id: "layout-save",
          layoutType: "save",
        },
      },
    );

    const viewData = selectViewData({
      state,
      constants: TEST_CONSTANTS,
      i18n: EN_I18N,
    });

    expect(state.layout.layoutType).toBe("save-load");
    expect(
      viewData.contextMenuItems.some(
        (item) => item.label === "Container (Save/Load Slot)",
      ),
    ).toBe(true);
    expect(
      viewData.emptyContextMenuItems.some(
        (item) => item.label === "Container (Save/Load Slot)",
      ),
    ).toBe(true);
  });

  it("normalizes a legacy load layout to save-load", () => {
    const state = createInitialState();

    setLayout(
      { state },
      {
        id: "layout-load",
        layout: {
          id: "layout-load",
          layoutType: "load",
        },
      },
    );

    expect(state.layout.layoutType).toBe("save-load");
  });

  it("shows fragment creation in all layout menus", () => {
    for (const layoutType of [
      "general",
      "save-load",
      "confirmDialog",
      "dialogue-adv",
      "dialogue-nvl",
      "history",
      "choice",
    ]) {
      const state = createInitialState();

      setLayout(
        { state },
        {
          id: `layout-${layoutType}`,
          layout: {
            id: `layout-${layoutType}`,
            layoutType,
          },
        },
      );

      const viewData = selectViewData({
        state,
        constants: LAYOUT_EDITOR_CONSTANTS,
        i18n: EN_I18N,
      });

      const contextMenuFragmentItem = viewData.contextMenuItems.find(
        (item) =>
          item.label === "Fragment" &&
          item.value?.action === "new-child-item" &&
          item.value?.type === "fragment-ref",
      );
      const emptyMenuFragmentItem = viewData.emptyContextMenuItems.find(
        (item) =>
          item.label === "Fragment" &&
          item.value?.action === "new-child-item" &&
          item.value?.type === "fragment-ref",
      );

      expect(contextMenuFragmentItem).toBeTruthy();
      expect(contextMenuFragmentItem.value).not.toHaveProperty("width");
      expect(contextMenuFragmentItem.value).not.toHaveProperty("height");
      expect(emptyMenuFragmentItem).toBeTruthy();
      expect(emptyMenuFragmentItem.value).not.toHaveProperty("width");
      expect(emptyMenuFragmentItem.value).not.toHaveProperty("height");
    }
  });

  it("keeps choice content text out of the empty choice layout menu", () => {
    const state = createInitialState();

    setLayout(
      { state },
      {
        id: "layout-choice",
        layout: {
          id: "layout-choice",
          layoutType: "choice",
        },
      },
    );

    const viewData = selectViewData({
      state,
      constants: LAYOUT_EDITOR_CONSTANTS,
      i18n: EN_I18N,
    });
    const emptyMenuLabels = viewData.emptyContextMenuItems.map(
      (item) => item.label,
    );

    expect(emptyMenuLabels).toContain("Container (Repeated Choice Item)");
    expect(emptyMenuLabels).toContain("Container (Single Choice Item)");
    expect(emptyMenuLabels).not.toContain("Text (Choice Content)");
  });

  it("uses combined special icons for preview-dependent explorer items", () => {
    const state = createInitialState();

    syncRepositoryState(
      { state },
      {
        projectResolution: { width: 1920, height: 1080 },
        layoutId: "layout-1",
        layout: {
          id: "layout-1",
          layoutType: "general",
        },
        layoutData: {
          items: {
            "text-bound": {
              type: "text-ref-character-name",
              name: "Character Name",
            },
            "text-free": {
              type: "text",
              name: "Text",
            },
            "choice-container": {
              type: "container-ref-choice-item",
              name: "Choice Item",
            },
          },
          tree: [
            { id: "text-bound" },
            { id: "text-free" },
            { id: "choice-container" },
          ],
        },
      },
    );

    const viewData = selectViewData({
      state,
      constants: TEST_CONSTANTS,
      i18n: EN_I18N,
    });

    expect(
      viewData.flatItems.find((item) => item.id === "text-bound")?.svg,
    ).toBe("text-special");
    expect(
      viewData.flatItems.find((item) => item.id === "text-free")?.svg,
    ).toBe("text");
    expect(
      viewData.flatItems.find((item) => item.id === "choice-container")?.svg,
    ).toBe("container-special");
    expect(
      viewData.flatItems.some((item) => item.iconCornerBadge === true),
    ).toBe(false);
  });

  it("shows semantic role labels only for referenced layout elements", () => {
    const state = createInitialState();
    const roleLabels = {
      "choice-item": ["container-ref-choice-item", "Choice Item"],
      "choice-item-text": ["text-ref-choice-item-content", "Choice Item Text"],
      "dialogue-text": ["text-revealing-ref-dialogue-content", "Dialogue Text"],
      "nvl-line": ["container-ref-dialogue-line", "NVL Line"],
      "nvl-line-speaker-name": [
        "text-ref-dialogue-line-character-name",
        "NVL Line Speaker Name",
      ],
      "nvl-line-text-legacy": [
        "text-ref-dialogue-line-content",
        "NVL Line Text",
      ],
      "nvl-line-text": ["text-revealing", "NVL Line Text"],
      "save-item": ["container-ref-save-load-slot", "Save Item"],
      "save-item-date": ["text-ref-save-load-slot-date", "Save Item Date"],
      "speaker-name": ["text-ref-character-name", "Speaker Name"],
    };
    const items = {
      text: {
        type: "text",
        name: "Text",
      },
    };

    for (const [id, [type]] of Object.entries(roleLabels)) {
      items[id] = { type, name: id };
    }

    syncRepositoryState(
      { state },
      {
        projectResolution: { width: 1920, height: 1080 },
        layoutId: "layout-1",
        layout: {
          id: "layout-1",
          layoutType: "general",
        },
        layoutData: {
          items,
          tree: Object.keys(items).map((id) => ({ id })),
        },
      },
    );

    for (const [id, [, expectedLabel]] of Object.entries(roleLabels)) {
      setDetailPanelSelectedItemId({ state }, { itemId: id });

      const viewData = selectViewData({
        state,
        constants: TEST_CONSTANTS,
        i18n: EN_I18N,
      });

      expect(viewData.itemRoleLabel).toBe(expectedLabel);
    }

    setDetailPanelSelectedItemId({ state }, { itemId: "text" });

    expect(
      selectViewData({
        state,
        constants: TEST_CONSTANTS,
        i18n: EN_I18N,
      }).itemRoleLabel,
    ).toBeUndefined();
  });

  it("keeps child creation actions only on container items", () => {
    const state = createInitialState();

    syncRepositoryState(
      { state },
      {
        projectResolution: { width: 1920, height: 1080 },
        layoutId: "layout-1",
        layout: {
          id: "layout-1",
          layoutType: "general",
        },
        layoutData: {
          items: {
            container1: {
              type: "container",
              name: "Container",
            },
            text1: {
              type: "text",
              name: "Text",
            },
          },
          tree: [{ id: "container1" }, { id: "text1" }],
        },
      },
    );

    const viewData = selectViewData({
      state,
      constants: {
        ...TEST_CONSTANTS,
        contextMenuItems: [
          {
            label: "Container",
            type: "item",
            createType: "container",
          },
          {
            label: "Rename",
            type: "item",
            value: "rename-item",
          },
          {
            label: "Delete",
            type: "item",
            value: "delete-item",
          },
        ],
      },
      i18n: EN_I18N,
    });

    const containerMenuItems = viewData.flatItems.find(
      (item) => item.id === "container1",
    )?.contextMenuItems;
    const textMenuItems = viewData.flatItems.find(
      (item) => item.id === "text1",
    )?.contextMenuItems;

    expect(
      containerMenuItems?.some(
        (item) => item?.value?.action === "new-child-item",
      ),
    ).toBe(true);
    expect(
      textMenuItems?.some((item) => item?.value?.action === "new-child-item"),
    ).toBe(false);
    expect(textMenuItems?.map((item) => item.label)).toEqual([
      "Rename",
      "Delete",
    ]);
  });

  it("keeps canvas selection state based on the selected item while the detail panel lags behind", () => {
    const state = createInitialState();

    syncRepositoryState(
      { state },
      {
        projectResolution: { width: 1920, height: 1080 },
        layoutId: "layout-1",
        layout: {
          id: "layout-1",
          layoutType: "general",
        },
        layoutData: {
          items: {
            "container-directed": {
              type: "container",
              name: "Directed Container",
              direction: "horizontal",
            },
            "child-selected": {
              type: "text",
              name: "Selected Child",
            },
            "panel-item": {
              type: "text",
              name: "Panel Item",
            },
          },
          tree: [
            {
              id: "container-directed",
              children: [{ id: "child-selected" }],
            },
            { id: "panel-item" },
          ],
        },
      },
    );

    setSelectedItemId({ state }, { itemId: "child-selected" });
    setDetailPanelSelectedItemId({ state }, { itemId: "panel-item" });

    const viewData = selectViewData({
      state,
      constants: TEST_CONSTANTS,
      i18n: EN_I18N,
    });

    expect(viewData.selectedItemIsInsideDirectedContainer).toBe(true);
    expect(viewData.isInsideDirectedContainer).toBe(false);
    expect(viewData.selectedItemId).toBe("child-selected");
    expect(viewData.detailPanelSelectedItemId).toBe("panel-item");
  });

  it("shows the selected node detail in place of the preview on touch layouts", () => {
    const state = createInitialState();

    syncRepositoryState(
      { state },
      {
        projectResolution: { width: 1920, height: 1080 },
        layoutId: "layout-1",
        layout: {
          id: "layout-1",
          layoutType: "general",
        },
        layoutData: {
          items: {
            "node-1": {
              type: "container",
              name: "Node 1",
            },
          },
          tree: [{ id: "node-1" }],
        },
      },
    );
    setUiConfig({ state }, { uiConfig: { inputMode: "touch" } });
    setPreviewData(
      { state },
      {
        previewData: {
          backgroundImageId: "unsaved-preview-image",
        },
      },
    );
    setSelectedItemId({ state }, { itemId: "node-1" });
    setDetailPanelSelectedItemId({ state }, { itemId: "node-1" });

    const viewData = selectViewData({
      state,
      constants: TEST_CONSTANTS,
      i18n: EN_I18N,
    });

    expect(viewData.showExplorerPanel).toBe(false);
    expect(viewData.showRightPanel).toBe(false);
    expect(viewData.showPreviewHeader).toBe(false);
    expect(viewData.showMobileNodeButton).toBe(true);
    expect(viewData.showMobilePreviewButton).toBe(true);
    expect(viewData.showMobileSelectedNodeDetail).toBe(true);
    expect(viewData.previewPanelVisibilityStyle).toBe("display: none;");
    expect(viewData.previewHydrationData).toEqual({
      backgroundImageId: "unsaved-preview-image",
    });
    expect(viewData.initialPreviewData).toEqual({});
    expect(viewData.nodeButtonLabel).toBe("Elements");
    expect(viewData.previewTitle).toBe("Preview");
    expect(viewData.item.name).toBe("Node 1");
  });

  it("shows the preview header on touch layouts, with no Save button, since the preview saves on its own", () => {
    const state = createInitialState();

    setUiConfig({ state }, { uiConfig: { inputMode: "touch" } });

    const viewData = selectViewData({
      state,
      constants: TEST_CONSTANTS,
      i18n: EN_I18N,
    });

    expect(viewData.showPreviewHeader).toBe(true);
    expect(viewData.showMobilePreviewButton).toBe(false);
    expect(viewData.showMobileSelectedNodeDetail).toBe(false);
    expect(viewData.previewPanelVisibilityStyle).toBe("");
    expect(viewData.previewHydrationData).toEqual(viewData.previewData);
    expect(viewData.previewTitle).toBe("Preview");
    expect(viewData).not.toHaveProperty("savePreviewButton");
  });
  it("shows the node explorer in place of the preview and node detail on touch layouts", () => {
    const state = createInitialState();

    syncRepositoryState(
      { state },
      {
        projectResolution: { width: 1920, height: 1080 },
        layoutId: "layout-1",
        layout: {
          id: "layout-1",
          layoutType: "general",
        },
        layoutData: {
          items: {
            "node-1": {
              type: "container",
              name: "Node 1",
            },
          },
          tree: [{ id: "node-1" }],
        },
      },
    );
    setUiConfig({ state }, { uiConfig: { inputMode: "touch" } });
    setSelectedItemId({ state }, { itemId: "node-1" });
    setDetailPanelSelectedItemId({ state }, { itemId: "node-1" });

    const select = () =>
      selectViewData({ state, constants: TEST_CONSTANTS, i18n: EN_I18N });

    expect(select().showMobileNodeExplorer).toBe(false);
    expect(select().showMobileSelectedNodeDetail).toBe(true);
    expect(select().nodeButtonVariant).toBe("se");

    openMobileFileExplorer({ state });
    const viewData = select();

    expect(viewData.showMobileNodeExplorer).toBe(true);
    expect(viewData.showMobileSelectedNodeDetail).toBe(false);
    expect(viewData.showMobilePreviewButton).toBe(true);
    expect(viewData.previewPanelVisibilityStyle).toBe("display: none;");
    expect(viewData.nodeButtonVariant).toBe("pr");
    expect(viewData.nodeExplorerTitle).toBe("Elements");
    expect(viewData.nodeMovePreviousLabel).toBe("Previous element");
    expect(viewData.nodeMoveNextLabel).toBe("Next element");
  });

  it("keeps the preview hidden but mounted while the node explorer is open without a selection", () => {
    const state = createInitialState();

    setUiConfig({ state }, { uiConfig: { inputMode: "touch" } });
    openMobileFileExplorer({ state });

    const viewData = selectViewData({
      state,
      constants: TEST_CONSTANTS,
      i18n: EN_I18N,
    });

    expect(viewData.showMobileNodeExplorer).toBe(true);
    expect(viewData.showMobilePreviewButton).toBe(false);
    expect(viewData.previewPanelVisibilityStyle).toBe("display: none;");
    expect(viewData.isPreviewMounted).toBe(false);
  });

  it("shows the Elements list as a left pane on tablet landscape instead of under the canvas", () => {
    const state = createInitialState();

    setUiConfig({ state }, { uiConfig: { inputMode: "touch" } });
    openMobileFileExplorer({ state });
    setAppWindowMetrics({ state }, { width: 1408, height: 880 });

    const select = () =>
      selectViewData({ state, constants: TEST_CONSTANTS, i18n: EN_I18N });
    const landscape = select();

    expect(selectIsTabletLandscape({ state })).toBe(true);
    expect(landscape.showTabletLandscapeExplorer).toBe(true);
    expect(landscape.tabletLandscapeExplorerWidth).toBe(300);
    expect(landscape.showMobileNodeExplorer).toBe(false);
    expect(landscape.showMobileNodeButton).toBe(false);
    expect(landscape.previewPanelVisibilityStyle).toBe("");

    setAppWindowMetrics({ state }, { width: 880, height: 1408 });
    const portrait = select();

    expect(selectIsTabletLandscape({ state })).toBe(false);
    expect(portrait.showTabletLandscapeExplorer).toBe(false);
    expect(portrait.showMobileNodeExplorer).toBe(true);
    expect(portrait.showMobileNodeButton).toBe(true);
  });

  it("keeps the edit panel and preview in the right panel on tablet landscape", () => {
    const state = createInitialState();

    syncRepositoryState(
      { state },
      {
        projectResolution: { width: 1920, height: 1080 },
        layoutId: "layout-1",
        layout: { id: "layout-1", layoutType: "general" },
        layoutData: {
          items: { "node-1": { type: "container", name: "Node 1" } },
          tree: [{ id: "node-1" }],
        },
      },
    );
    setUiConfig({ state }, { uiConfig: { inputMode: "touch" } });
    setAppWindowMetrics({ state }, { width: 1408, height: 880 });
    setSelectedItemId({ state }, { itemId: "node-1" });
    setDetailPanelSelectedItemId({ state }, { itemId: "node-1" });

    const viewData = selectViewData({
      state,
      constants: TEST_CONSTANTS,
      i18n: EN_I18N,
    });

    expect(viewData.showRightPanel).toBe(true);
    expect(viewData.showMobilePanels).toBe(false);
    expect(viewData.showMobileSelectedNodeDetail).toBe(false);
    expect(viewData.showMobileNodeExplorer).toBe(false);
    expect(viewData.showMobilePreviewButton).toBe(false);
    expect(viewData.showMobileNodeButton).toBe(false);
    expect(viewData.detailPanelSelectedItemId).toBe("node-1");
  });

  it("offers Edit and Preview tabs in the right panel that start on Edit with nothing selected", () => {
    const state = createInitialState();
    const select = () =>
      selectViewData({ state, constants: TEST_CONSTANTS, i18n: EN_I18N });

    expect(select().showRightPanel).toBe(true);
    expect(select().rightPanelMode).toBe("edit");
    expect(select().selectedItemId).toBeUndefined();
    expect(select().detailPanelSelectedItemId).toBeUndefined();
    expect(select().rightPanelModeTabs).toEqual([
      { id: "edit", label: "Edit" },
      { id: "preview", label: "Preview" },
    ]);
    expect(select().rightPanelEditStyle).toBe("");
    expect(select().rightPanelPreviewStyle).toBe("display: none;");

    setRightPanelMode({ state }, { mode: "preview" });

    expect(select().rightPanelMode).toBe("preview");
    expect(select().rightPanelEditStyle).toBe("display: none;");
    expect(select().rightPanelPreviewStyle).toBe("");

    setRightPanelMode({ state }, { mode: "unknown" });

    expect(select().rightPanelMode).toBe("preview");
  });

  it("uses the whole workspace height for the canvas whenever there is a right panel", () => {
    const state = createInitialState();
    const select = () =>
      selectViewData({ state, constants: TEST_CONSTANTS, i18n: EN_I18N });

    // The canvas moves freely: rvn-zoom-viewport sets its zoom and place.
    const freeCanvas =
      "position: absolute; left: 0; top: 0; width: calc(min(100%, 163.5556cqh) * var(--canvas-zoom, 1)); transform: translate(var(--canvas-x, 0px), var(--canvas-y, 0px));";
    expect(select().canvasWrapperStyle).toBe(freeCanvas);
    expect(select().canvasBackgroundStyle).toContain("overflow: hidden");
    expect(select().canvasWorkspaceStyle).toBe("container-type: size;");

    setUiConfig({ state }, { uiConfig: { inputMode: "touch" } });
    expect(select().canvasWrapperStyle).toBe(
      "position: relative; width: min(100%, 88.8889cqh); margin-left: auto; margin-right: auto;",
    );
    expect(select().canvasBackgroundStyle).toBe("");

    setAppWindowMetrics({ state }, { width: 1408, height: 880 });
    expect(select().canvasWrapperStyle).toBe(freeCanvas);
  });

  describe("canvas zoom", () => {
    const select = (state) =>
      selectViewData({ state, constants: TEST_CONSTANTS, i18n: EN_I18N });

    it("steps through zoom levels relative to the fitted canvas", () => {
      const state = createInitialState();
      expect(select(state)).toMatchObject({
        showCanvasZoomControls: true,
        canvasZoom: 1,
        canvasZoomLabel: "100%",
        canvasZoomFitLabel: "Fit to view",
      });

      zoomCanvasIn({ state });
      zoomCanvasIn({ state });
      expect(select(state)).toMatchObject({
        canvasZoom: 2,
        canvasZoomLabel: "200%",
      });

      zoomCanvasIn({ state });
      expect(select(state).canvasZoomLabel).toBe("300%");
      expect(select(state).canvasZoomInDisabled).toBe(false);

      for (let step = 0; step < 5; step += 1) zoomCanvasIn({ state });
      expect(select(state).canvasZoomLabel).toBe("1000%");
      expect(select(state).canvasZoomInDisabled).toBe(true);
      zoomCanvasIn({ state });
      expect(select(state).canvasZoomLabel).toBe("1000%");

      resetCanvasZoom({ state });
      zoomCanvasOut({ state });
      zoomCanvasOut({ state });
      expect(select(state).canvasZoomLabel).toBe("50%");
      zoomCanvasOut({ state });
      zoomCanvasOut({ state });
      expect(select(state)).toMatchObject({
        canvasZoomLabel: "10%",
        canvasZoomOutDisabled: true,
        canvasZoomInDisabled: false,
      });
    });

    it("shows a fitted canvas without zoom controls when panels sit under it", () => {
      const state = createInitialState();
      zoomCanvasIn({ state });
      setUiConfig({ state }, { uiConfig: { inputMode: "touch" } });

      expect(select(state)).toMatchObject({
        showCanvasZoomControls: false,
        canvasZoom: 1,
      });

      setAppWindowMetrics({ state }, { width: 1408, height: 880 });
      expect(select(state).canvasZoom).toBe(1.5);
    });

    it("keeps a gesture zoom in range and steps from it with the buttons", () => {
      const state = createInitialState();

      setCanvasZoom({ state }, { zoom: 1.37 });
      expect(select(state)).toMatchObject({
        canvasZoom: 1.37,
        canvasZoomLabel: "137%",
      });
      zoomCanvasIn({ state });
      expect(select(state).canvasZoom).toBe(1.5);
      setCanvasZoom({ state }, { zoom: 1.37 });
      zoomCanvasOut({ state });
      expect(select(state).canvasZoom).toBe(1);

      setCanvasZoom({ state }, { zoom: 12 });
      expect(select(state).canvasZoom).toBe(10);
      setCanvasZoom({ state }, { zoom: 0.05 });
      expect(select(state).canvasZoom).toBe(0.1);
    });
  });

  it("never shows the node explorer on desktop layouts", () => {
    const state = createInitialState();

    openMobileFileExplorer({ state });

    const viewData = selectViewData({
      state,
      constants: TEST_CONSTANTS,
      i18n: EN_I18N,
    });

    expect(viewData.showMobileNodeExplorer).toBe(false);
    expect(viewData.previewPanelVisibilityStyle).toBe("");
  });
});

describe("layoutEditor.store preview autosave", () => {
  const syncLayout = (state, persistedPreviewData, layoutId = "layout-1") =>
    syncRepositoryState(
      { state },
      {
        projectResolution: { width: 1920, height: 1080 },
        layoutId,
        layout: { id: layoutId, layoutType: "general" },
        layoutData: { items: {}, tree: [] },
        persistedPreviewData,
      },
    );

  it("has unsaved preview data only once the user edits it", () => {
    const state = createInitialState();
    syncLayout(state, { backgroundImageId: "image-one" });

    // What the Preview derives on its own is not unsaved.
    setPreviewData(
      { state },
      {
        previewData: {
          backgroundImageId: "image-one",
          dialogue: { content: [{ text: "Sample" }] },
        },
      },
    );
    expect(selectUnsavedPreviewData({ state })).toBeUndefined();

    setPreviewData(
      { state },
      { previewData: { backgroundImageId: "image-two" } },
    );
    markPreviewDataEdited({ state });
    expect(selectUnsavedPreviewData({ state })).toEqual({
      backgroundImageId: "image-two",
    });

    markPreviewDataSaved(
      { state },
      { previewData: { backgroundImageId: "image-two" }, version: 1 },
    );
    expect(selectUnsavedPreviewData({ state })).toBeUndefined();
  });

  it("keeps what the preview shows when its save comes back, keys in any order", () => {
    const state = createInitialState();
    syncLayout(state, {});
    const previewData = {
      backgroundImageId: "image-two",
      runtime: { autoMode: true, skipMode: false },
    };
    setPreviewData({ state }, { previewData });
    markPreviewDataEdited({ state });
    markPreviewDataSaved({ state }, { previewData, version: 1 });

    syncLayout(state, {
      runtime: { skipMode: false, autoMode: true },
      backgroundImageId: "image-two",
    });

    expect(selectUnsavedPreviewData({ state })).toBeUndefined();
    expect(state.previewData).toEqual(previewData);
  });

  it("keeps an edit made while an older save ran unsaved", () => {
    const state = createInitialState();
    syncLayout(state, {});
    setPreviewData(
      { state },
      { previewData: { backgroundImageId: "image-two" } },
    );
    markPreviewDataEdited({ state });
    setPreviewData(
      { state },
      { previewData: { backgroundImageId: "image-three" } },
    );
    markPreviewDataEdited({ state });
    markPreviewDataSaved(
      { state },
      { previewData: { backgroundImageId: "image-two" }, version: 1 },
    );

    syncLayout(state, { backgroundImageId: "image-two" });

    expect(selectUnsavedPreviewData({ state })).toEqual({
      backgroundImageId: "image-three",
    });
  });

  it("starts another layout with no edits", () => {
    const state = createInitialState();
    syncLayout(state, {});
    setPreviewData(
      { state },
      { previewData: { backgroundImageId: "image-two" } },
    );
    markPreviewDataEdited({ state });

    syncLayout(state, {}, "layout-2");

    expect(selectUnsavedPreviewData({ state })).toBeUndefined();
  });
});
