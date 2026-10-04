import { parseAndRender } from "jempl";
import { toFlatItems } from "../../internal/project/tree.js";
import {
  DEFAULT_PROJECT_RESOLUTION,
  formatCanvasMaxWidth,
  formatHalfViewportCanvasMaxWidth,
  requireProjectResolution,
} from "../../internal/projectResolution.js";
import {
  TABLET_LANDSCAPE_EXPLORER_WIDTH,
  isTouchUiConfig,
  selectIsTabletLandscapeState,
  setMobileResourcePageWindowMetricsState,
} from "../../internal/ui/resourcePages/mobileResourcePage.js";
import {
  isItemDirectChildOfDirectedContainer,
  isItemInsideSaveLoadSlot,
  selectLayoutEditorSelectedItem,
  toLayoutEditorContextMenuItems,
  toLayoutEditorExplorerItems,
} from "./support/layoutEditorViewData.js";
import { selectLayoutEditorPageCopy } from "./support/layoutEditorPageCopy.js";
import { selectEditHistoryCopy } from "../../internal/ui/editHistory.js";
import {
  createEditHistory,
  getEditHistoryStep,
  moveEditHistoryStep as moveHistoryStep,
  recordEditHistoryStep as recordHistoryStep,
} from "../../internal/editHistory.js";
import { restoreLayoutElementSnapshot } from "../../internal/project/layout.js";

const normalizePreviewData = (previewData) => {
  return previewData && typeof previewData === "object"
    ? structuredClone(previewData)
    : {};
};

const arePreviewDataEqual = (left, right) => {
  return JSON.stringify(left ?? {}) === JSON.stringify(right ?? {});
};

// Desktop and tablet landscape keep the edit panel and preview in a right
// panel, so the canvas can use the whole workspace height. Other touch layouts
// stack the panels under the canvas and give it half the height.
const selectShowRightPanel = ({ state }) =>
  !state.isTouchMode || selectIsTabletLandscapeState({ state });

const selectLayoutEditorCanvasMaxWidth = ({ state }) => {
  const resolution = state.projectResolution ?? DEFAULT_PROJECT_RESOLUTION;

  if (selectShowRightPanel({ state })) {
    return formatCanvasMaxWidth(resolution, {
      heightUnit: "cqh",
      heightPercent: 92,
    });
  }

  return formatHalfViewportCanvasMaxWidth(resolution, { heightUnit: "cqh" });
};

// Canvas zoom is relative to the canvas fitted to the workspace (1 = fit).
// The buttons step through these levels; gestures set any zoom in their
// range, which matches rvn-zoom-viewport. The renderer draws at the project
// resolution and the page scales it, so higher levels look soft.
const CANVAS_ZOOM_LEVELS = Object.freeze([
  0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 8, 10,
]);

// Only the right-panel layouts (desktop and tablet landscape) give the canvas
// a scrolling workspace, so other layouts always show it fitted.
const selectCanvasZoom = ({ state }) =>
  selectShowRightPanel({ state }) ? state.canvasZoom : 1;

const RIGHT_PANEL_MODES = new Set(["edit", "preview"]);

const CREATE_TYPE_LABEL_KEYS = Object.freeze({
  container: "containerMenuItem",
  sprite: "imageMenuItem",
  "spritesheet-animation": "spritesheetAnimationMenuItem",
  particle: "particleMenuItem",
  text: "textMenuItem",
  slider: "sliderMenuItem",
  input: "inputMenuItem",
  "form-submit-button": "inputSubmitContainerMenuItem",
  "fragment-ref": "fragmentMenuItem",
  "container-confirm-dialog-ok": "containerConfirmOkMenuItem",
  "container-confirm-dialog-cancel": "containerConfirmCancelMenuItem",
  "text-dialogue-content": "textDialogueContentMenuItem",
  "text-character-name": "textCharacterNameMenuItem",
  "container-dialogue-line": "containerDialogueLineMenuItem",
  "text-dialogue-line-character-name": "textLineCharacterNameMenuItem",
  "text-dialogue-line-content": "textLineContentMenuItem",
  "container-history-line": "containerHistoryItemMenuItem",
  "text-history-line-character-name": "textHistoryCharacterNameMenuItem",
  "text-history-line-content": "textHistoryLineContentMenuItem",
  "container-choice-item": "containerRepeatedChoiceItemMenuItem",
  "container-choice-single-item": "containerSingleChoiceItemMenuItem",
  "container-save-load-slot": "containerSaveLoadSlotMenuItem",
  "sprite-save-load-slot-image": "imageSaveImageMenuItem",
  "text-save-load-slot-date": "textSaveDateMenuItem",
  "text-choice-item-content": "textChoiceContentMenuItem",
  rect: "rectMenuItem",
});

const VALUE_LABEL_KEYS = Object.freeze({
  "rename-item": "renameMenuItem",
  "delete-item": "deleteMenuItem",
});

const LABEL_TEXT_KEYS = Object.freeze({
  "Add Element": "addElementMenuLabel",
  Edit: "editMenuLabel",
});

const ITEM_ROLE_LABELS = Object.freeze({
  "container-ref-choice-item": {
    copyKey: "choiceItemElementLabel",
    fallback: "Choice Item",
  },
  "container-ref-dialogue-line": {
    copyKey: "nvlLineElementLabel",
    fallback: "NVL Line",
  },
  "container-ref-save-load-slot": {
    copyKey: "saveItemElementLabel",
    fallback: "Save Item",
  },
  "text-ref-character-name": {
    copyKey: "speakerNameElementLabel",
    fallback: "Speaker Name",
  },
  "text-ref-choice-item-content": {
    copyKey: "choiceItemTextElementLabel",
    fallback: "Choice Item Text",
  },
  "text-ref-dialogue-line-character-name": {
    copyKey: "nvlLineSpeakerNameElementLabel",
    fallback: "NVL Line Speaker Name",
  },
  "text-ref-dialogue-line-content": {
    copyKey: "nvlLineTextElementLabel",
    fallback: "NVL Line Text",
  },
  "text-ref-save-load-slot-date": {
    copyKey: "saveItemDateElementLabel",
    fallback: "Save Item Date",
  },
  "text-revealing-ref-dialogue-content": {
    copyKey: "dialogueTextElementLabel",
    fallback: "Dialogue Text",
  },
  "text-revealing": {
    copyKey: "nvlLineTextElementLabel",
    fallback: "NVL Line Text",
  },
});

const selectItemRoleLabel = (itemType, copy = {}) => {
  const role = ITEM_ROLE_LABELS[itemType];
  return role ? (copy[role.copyKey] ?? role.fallback) : undefined;
};

const localizeMenuItems = (items = [], copy = {}) => {
  return items.map((item) => {
    if (!item?.label) {
      return item;
    }

    const labelKey =
      CREATE_TYPE_LABEL_KEYS[item.createType] ??
      VALUE_LABEL_KEYS[item.value] ??
      LABEL_TEXT_KEYS[item.label];

    if (!labelKey || !copy[labelKey]) {
      return item;
    }

    return {
      ...item,
      label: copy[labelKey],
    };
  });
};

export const createInitialState = () => {
  return {
    lastUpdateDate: undefined,
    layoutData: { tree: [], items: {} },
    selectedItemId: undefined,
    detailPanelSelectedItemId: undefined,
    detailPanelSelectionRequestId: 0,
    layout: undefined,
    images: { tree: [], items: {} },
    soundsData: { tree: [], items: {} },
    spritesheetsData: { tree: [], items: {} },
    particlesData: { tree: [], items: {} },
    charactersData: { tree: [], items: {} },
    layoutsData: { tree: [], items: {} },
    textStylesData: { tree: [], items: {} },
    colorsData: { tree: [], items: {} },
    fontsData: { tree: [], items: {} },
    variablesData: { tree: [], items: {} },
    previewData: {},
    persistedPreviewData: {},
    initialPreviewData: {},
    isPreviewMounted: false,
    isTouchMode: false,
    appWindowMetrics: { width: 0, height: 0 },
    isMobileFileExplorerOpen: false,
    rightPanelMode: "preview",
    canvasZoom: 1,
    canvasPreviewItem: undefined,
    // Undo and redo for edits made since the page opened.
    editHistory: createEditHistory(),
    // Undone or redone steps not saved yet, kept on top of repository data.
    pendingHistoryRestores: [],
    projectResolution: DEFAULT_PROJECT_RESOLUTION,
    selectedElementMetrics: undefined,
    lastPersistErrorAt: 0,
    pendingPersistPayload: undefined,
  };
};

export const zoomCanvasIn = ({ state }) => {
  state.canvasZoom =
    CANVAS_ZOOM_LEVELS.find((level) => level > state.canvasZoom) ??
    state.canvasZoom;
};

export const zoomCanvasOut = ({ state }) => {
  state.canvasZoom =
    CANVAS_ZOOM_LEVELS.findLast((level) => level < state.canvasZoom) ??
    state.canvasZoom;
};

export const setCanvasZoom = ({ state }, { zoom } = {}) => {
  state.canvasZoom = Math.min(
    CANVAS_ZOOM_LEVELS.at(-1),
    Math.max(CANVAS_ZOOM_LEVELS[0], zoom),
  );
};

export const resetCanvasZoom = ({ state }) => {
  state.canvasZoom = 1;
};

export const setItems = ({ state }, { layoutData } = {}) => {
  state.layoutData = layoutData;
};

const getLayoutEditorLayoutType = (layoutType, resourceType) => {
  if (resourceType === "controls") {
    return layoutType;
  }

  if (layoutType === "save" || layoutType === "load") {
    return "save-load";
  }

  return layoutType ?? "general";
};

const assignLayoutState = (state, { id, layout, resourceType } = {}) => {
  const nextResourceType = resourceType || layout?.resourceType || "layouts";

  if (!layout && !id) {
    state.layout = undefined;
    return;
  }

  if (!state.layout || typeof state.layout !== "object") {
    state.layout = {};
  }

  for (const key of Object.keys(state.layout)) {
    delete state.layout[key];
  }

  for (const [key, value] of Object.entries(layout ?? {})) {
    state.layout[key] = value;
  }

  state.layout.id = id || layout?.id || undefined;
  state.layout.resourceType = nextResourceType;
  state.layout.layoutType = getLayoutEditorLayoutType(
    layout?.layoutType,
    nextResourceType,
  );
};

export const setLayout = ({ state }, payload = {}) => {
  assignLayoutState(state, payload);
};

export const setProjectResolution = ({ state }, { projectResolution } = {}) => {
  state.projectResolution = requireProjectResolution(
    projectResolution,
    "Project resolution",
  );
};

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  if (itemId !== state.selectedItemId) {
    state.canvasPreviewItem = undefined;
  }
  state.selectedItemId = itemId;
  state.selectedElementMetrics = undefined;

  if (!itemId) {
    state.detailPanelSelectedItemId = undefined;
    state.detailPanelSelectionRequestId += 1;
  }
};

export const setDetailPanelSelectedItemId = ({ state }, { itemId } = {}) => {
  state.detailPanelSelectedItemId = itemId;
};

export const requestDetailPanelSelectionSync = (
  { state },
  { itemId, requestId } = {},
) => {
  state.detailPanelSelectionRequestId =
    requestId ?? state.detailPanelSelectionRequestId + 1;

  if (!itemId) {
    state.detailPanelSelectedItemId = undefined;
  }
};

export const setPreviewData = ({ state }, { previewData } = {}) => {
  state.previewData = normalizePreviewData(previewData);
};

export const setPreviewMounted = ({ state }, { isMounted } = {}) => {
  state.isPreviewMounted = isMounted === true;
};

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode = isTouchUiConfig(uiConfig);
};

export const setRightPanelMode = ({ state }, { mode } = {}) => {
  if (RIGHT_PANEL_MODES.has(mode)) {
    state.rightPanelMode = mode;
  }
};

export const setAppWindowMetrics = ({ state }, { width, height } = {}) => {
  setMobileResourcePageWindowMetricsState(state, { width, height });
};

export const openMobileFileExplorer = ({ state }, _payload = {}) => {
  state.isMobileFileExplorerOpen = true;
};

export const closeMobileFileExplorer = ({ state }, _payload = {}) => {
  state.isMobileFileExplorerOpen = false;
};

// An edit panel value shown on the canvas before it is submitted. Only the
// canvas and preview see it; a saved update or a cancel replaces it.
export const setCanvasPreviewItem = ({ state }, { itemId, item } = {}) => {
  state.canvasPreviewItem = { itemId, item };
};

export const clearCanvasPreviewItem = ({ state }) => {
  state.canvasPreviewItem = undefined;
};

export const selectHasCanvasPreviewItem = ({ state }) =>
  state.canvasPreviewItem !== undefined;

export const updateSelectedItem = ({ state }, { itemId, updatedItem } = {}) => {
  const targetItemId = itemId ?? state.selectedItemId;
  if (state.canvasPreviewItem?.itemId === targetItemId) {
    state.canvasPreviewItem = undefined;
  }

  if (targetItemId && state.layoutData && state.layoutData.items) {
    state.layoutData.items[targetItemId] = updatedItem;
  }
  state.lastUpdateDate = Date.now();
  state.selectedElementMetrics = undefined;
};

export const setSelectedElementMetrics = ({ state }, { metrics } = {}) => {
  state.selectedElementMetrics = metrics;
};

export const recordEditHistoryStep = (
  { state },
  { before, after, mergeKey, time } = {},
) => {
  recordHistoryStep(state.editHistory, { before, after, mergeKey, time });
};

export const selectEditHistoryStep = ({ state }, { direction } = {}) =>
  getEditHistoryStep(state.editHistory, direction);

export const moveEditHistoryStep = ({ state }, { direction } = {}) => {
  moveHistoryStep(state.editHistory, direction);
};

export const selectLayoutElements = ({ state }) => state.layoutData;

// Shows an undone or redone step before it is saved. It stays on top of
// repository data until clearPendingHistoryRestore.
export const applyHistoryRestore = (
  { state },
  { restoreId, target, elements } = {},
) => {
  state.layoutData = elements;
  if (restoreId) {
    state.pendingHistoryRestores.push({ restoreId, target });
  }
};

export const clearPendingHistoryRestore = ({ state }, { restoreId } = {}) => {
  state.pendingHistoryRestores = state.pendingHistoryRestores.filter(
    (restore) => restore.restoreId !== restoreId,
  );
};

export const setLastPersistErrorAt = ({ state }, { timestamp } = {}) => {
  state.lastPersistErrorAt = Number.isFinite(timestamp) ? timestamp : 0;
};

export const setPendingPersistPayload = ({ state }, { payload } = {}) => {
  state.pendingPersistPayload =
    payload && typeof payload === "object" ? payload : undefined;
};

export const clearPendingPersistPayload = (
  { state },
  { persistenceRequestId } = {},
) => {
  if (!persistenceRequestId) {
    state.pendingPersistPayload = undefined;
    return;
  }

  if (
    state.pendingPersistPayload?.persistenceRequestId === persistenceRequestId
  ) {
    state.pendingPersistPayload = undefined;
  }
};

export const setImages = ({ state }, { images } = {}) => {
  state.images = images;
};

export const setSoundsData = ({ state }, { soundsData } = {}) => {
  state.soundsData = soundsData;
};

export const setSpritesheetsData = ({ state }, { spritesheetsData } = {}) => {
  state.spritesheetsData = spritesheetsData;
};

export const setParticlesData = ({ state }, { particlesData } = {}) => {
  state.particlesData = particlesData;
};

export const setLayoutsData = ({ state }, { layoutsData } = {}) => {
  state.layoutsData = layoutsData;
};

export const setTextStylesData = ({ state }, { textStylesData } = {}) => {
  state.textStylesData = textStylesData;
};

export const setColorsData = ({ state }, { colorsData } = {}) => {
  state.colorsData = colorsData;
};

export const setFontsData = ({ state }, { fontsData } = {}) => {
  state.fontsData = fontsData;
};

export const setVariablesData = ({ state }, { variablesData } = {}) => {
  state.variablesData = variablesData;
};

export const syncRepositoryState = ({ state }, payload = {}) => {
  const {
    projectResolution,
    layoutId,
    layout,
    resourceType = "layouts",
    layoutData,
    images,
    soundsData,
    spritesheetsData,
    particlesData,
    charactersData,
    layoutsData,
    textStylesData,
    colorsData,
    fontsData,
    variablesData,
    persistedPreviewData,
  } = payload;
  const currentLayoutId = state.layout?.id;
  const currentResourceType = state.layout?.resourceType || "layouts";
  const nextPersistedPreviewData = normalizePreviewData(persistedPreviewData);
  const shouldApplyPersistedPreview =
    currentLayoutId !== layoutId ||
    currentResourceType !== (resourceType ?? "layouts") ||
    arePreviewDataEqual(state.previewData, state.persistedPreviewData);
  const shouldRefreshInitialPreviewData =
    shouldApplyPersistedPreview ||
    arePreviewDataEqual(state.previewData, nextPersistedPreviewData);

  state.projectResolution = requireProjectResolution(
    projectResolution,
    "Project resolution",
  );
  assignLayoutState(state, {
    id: layoutId,
    layout,
    resourceType,
  });
  state.layoutData = layoutData ?? { items: {}, tree: [] };
  for (const { target } of state.pendingHistoryRestores) {
    const restore = restoreLayoutElementSnapshot({
      elements: state.layoutData,
      target,
    });
    if (restore.valid) {
      state.layoutData = restore.elements;
    }
  }
  const pending = state.pendingPersistPayload;
  if (
    pending &&
    pending.layoutId === layoutId &&
    pending.resourceType === resourceType &&
    state.layoutData.items[pending.selectedItemId]
  ) {
    // An earlier save can finish while a newer drag position is still queued.
    // Copy the item map so preserving the draft never mutates repository data.
    const items = Object.assign({}, state.layoutData.items);
    items[pending.selectedItemId] = pending.updatedItem;
    state.layoutData = { tree: state.layoutData.tree, items };
  }
  state.images = images ?? { items: {}, tree: [] };
  state.soundsData = soundsData ?? { items: {}, tree: [] };
  state.spritesheetsData = spritesheetsData ?? { items: {}, tree: [] };
  state.particlesData = particlesData ?? { items: {}, tree: [] };
  state.charactersData = charactersData ?? { items: {}, tree: [] };
  state.layoutsData = layoutsData ?? { items: {}, tree: [] };
  state.textStylesData = textStylesData ?? { items: {}, tree: [] };
  state.colorsData = colorsData ?? { items: {}, tree: [] };
  state.fontsData = fontsData ?? { items: {}, tree: [] };
  state.variablesData = variablesData ?? { items: {}, tree: [] };
  state.persistedPreviewData = nextPersistedPreviewData;

  if (shouldApplyPersistedPreview) {
    state.previewData = normalizePreviewData(nextPersistedPreviewData);
  }

  if (shouldRefreshInitialPreviewData) {
    state.initialPreviewData = normalizePreviewData(nextPersistedPreviewData);
  }
};

export const selectLayoutId = ({ state }) => {
  return state.layout?.id;
};

export const selectLayoutResourceType = ({ state }) => {
  return state.layout?.resourceType || "layouts";
};

export const selectCurrentLayoutType = ({ state }) => {
  return state.layout?.layoutType;
};

export const selectProjectResolution = ({ state }) => {
  return state.projectResolution;
};

export const selectImages = ({ state }) => state.images;
export const selectSoundsData = ({ state }) => state.soundsData;
export const selectSpritesheetsData = ({ state }) => state.spritesheetsData;
export const selectParticlesData = ({ state }) => state.particlesData;
export const selectLayoutsData = ({ state }) => state.layoutsData;

export const selectSelectedItem = ({ state }) => {
  return selectLayoutEditorSelectedItem({ state });
};

export const selectItemDataById = ({ state }, { itemId } = {}) => {
  if (!itemId) {
    return undefined;
  }

  const item = state.layoutData?.items?.[itemId];
  if (!item) {
    return undefined;
  }

  return {
    id: itemId,
    ...item,
  };
};

export const selectSelectedItemData = ({ state }) => {
  return selectItemDataById({ state }, { itemId: state.selectedItemId });
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;
export const selectDetailPanelSelectedItemId = ({ state }) =>
  state.detailPanelSelectedItemId;
export const selectDetailPanelSelectionRequestId = ({ state }) =>
  state.detailPanelSelectionRequestId;

export const selectSelectedElementMetrics = ({ state }) => {
  return state.selectedElementMetrics;
};

export const selectLastPersistErrorAt = ({ state }) => {
  return Number.isFinite(state.lastPersistErrorAt)
    ? state.lastPersistErrorAt
    : 0;
};

export const selectPendingPersistPayload = ({ state }) => {
  return state.pendingPersistPayload;
};

export const selectItems = ({ state }) => {
  return state.layoutData;
};

export const selectTextStylesData = ({ state }) => {
  return state.textStylesData;
};

export const selectFontsData = ({ state }) => {
  return state.fontsData;
};

export const selectVariablesData = ({ state }) => {
  return state.variablesData;
};

export const selectPreviewData = ({ state }) => {
  return state.previewData;
};

export const selectInitialPreviewData = ({ state }) => {
  return state.initialPreviewData;
};

export const selectIsPreviewMounted = ({ state }) => state.isPreviewMounted;
export const selectIsTouchMode = ({ state }) => state.isTouchMode;
export const selectIsTabletLandscape = selectIsTabletLandscapeState;
export const selectIsMobileFileExplorerOpen = ({ state }) =>
  state.isMobileFileExplorerOpen;

export const selectViewData = ({ state, constants, i18n }) => {
  const copy = selectLayoutEditorPageCopy(i18n);
  const editHistoryCopy = selectEditHistoryCopy(i18n);
  const selectedItem = selectItemDataById(
    { state },
    { itemId: state.selectedItemId },
  );
  const item = selectItemDataById(
    { state },
    { itemId: state.detailPanelSelectedItemId },
  );
  const isControlResource = state.layout?.resourceType === "controls";
  const layoutType = state.layout?.layoutType;
  const parsedContextMenuItems = parseAndRender(
    isControlResource
      ? constants.controlContextMenuItems
      : constants.contextMenuItems,
    { layoutType },
  );
  const parsedEmptyContextMenuItems = parseAndRender(
    isControlResource
      ? constants.controlEmptyContextMenuItems
      : constants.emptyContextMenuItems,
    { layoutType },
  );
  const contextMenuItems = toLayoutEditorContextMenuItems(
    localizeMenuItems(parsedContextMenuItems, copy),
    state.projectResolution,
  );
  const emptyContextMenuItems = toLayoutEditorContextMenuItems(
    localizeMenuItems(parsedEmptyContextMenuItems, copy),
    state.projectResolution,
  );
  const flatLayoutItems = toFlatItems(state.layoutData);
  const flatItems = toLayoutEditorExplorerItems(flatLayoutItems, {
    contextMenuItems,
    copy,
    alwaysShowVisibilityToggle: state.isTouchMode,
  });
  const parentIdById = Object.fromEntries(
    flatItems.map((flatItem) => [flatItem.id, flatItem.parentId]),
  );
  const layout =
    state.layout === undefined
      ? undefined
      : {
          ...state.layout,
          layoutType,
        };
  let layoutState;
  if (layout) {
    layoutState = {
      id: layout.id,
      layoutType: layout.layoutType,
      layoutSchemaVersion: layout.layoutSchemaVersion,
      elements: state.canvasPreviewItem
        ? {
            ...state.layoutData,
            items: {
              ...state.layoutData.items,
              [state.canvasPreviewItem.itemId]: state.canvasPreviewItem.item,
            },
          }
        : state.layoutData,
    };
  }

  const selectedItemIsInsideSaveLoadSlot = isItemInsideSaveLoadSlot({
    layoutData: state.layoutData,
    parentIdById,
    itemId: selectedItem?.id,
  });
  const selectedItemIsInsideDirectedContainer =
    isItemDirectChildOfDirectedContainer({
      layoutData: state.layoutData,
      parentIdById,
      itemId: selectedItem?.id,
    });
  const selectedItemIsEffectivelyHidden =
    flatItems.find((flatItem) => flatItem.id === selectedItem?.id)
      ?.effectivelyHidden === true;
  const detailPanelIsInsideSaveLoadSlot =
    item?.id === selectedItem?.id
      ? selectedItemIsInsideSaveLoadSlot
      : isItemInsideSaveLoadSlot({
          layoutData: state.layoutData,
          parentIdById,
          itemId: item?.id,
        });
  const detailPanelIsInsideDirectedContainer =
    item?.id === selectedItem?.id
      ? selectedItemIsInsideDirectedContainer
      : isItemDirectChildOfDirectedContainer({
          layoutData: state.layoutData,
          parentIdById,
          itemId: item?.id,
        });
  // Tablet landscape keeps the Elements list in a persistent left pane, so the
  // inline list under the canvas is only for narrower touch layouts.
  const showTabletLandscapeExplorer = selectIsTabletLandscapeState({ state });
  const showRightPanel = selectShowRightPanel({ state });
  const showMobilePanels = !showRightPanel;
  const showMobileNodeExplorer =
    showMobilePanels && state.isMobileFileExplorerOpen;
  // The node explorer and the selected node detail take turns in the panel
  // below the canvas. The preview stays mounted but hidden behind either one.
  const showMobileSelectedNodeDetail =
    showMobilePanels && Boolean(item) && !showMobileNodeExplorer;
  const previewPanelVisibilityStyle =
    showMobileSelectedNodeDetail || showMobileNodeExplorer
      ? "display: none;"
      : "";
  const previewHydrationData = state.isTouchMode
    ? state.previewData
    : state.initialPreviewData;
  const canvasZoom = selectCanvasZoom({ state });
  const canvasFitWidth = selectLayoutEditorCanvasMaxWidth({ state });

  return {
    item,
    itemRoleLabel: selectItemRoleLabel(item?.type, copy),
    loadingPreviewLabel: copy.loadingPreviewLabel,
    noSelectionLabel: copy.noSelectionLabel,
    nodeButtonLabel: copy.nodeButtonLabel ?? "Elements",
    nodeExplorerTitle:
      copy.nodeExplorerTitle ?? copy.nodeButtonLabel ?? "Elements",
    previewTitle: copy.previewTitle ?? "Preview",
    savePreviewButton: copy.savePreviewButton,
    flatItems,
    selectedItemId: state.selectedItemId,
    detailPanelSelectedItemId: state.detailPanelSelectedItemId,
    resourceCategory: isControlResource ? "systemConfig" : "userInterface",
    selectedResourceId: isControlResource ? "controls" : "layout-editor",
    contextMenuItems,
    emptyContextMenuItems,
    layoutState,
    // The canvas is sized in container height units on every layout.
    canvasWorkspaceStyle: "container-type: size;",
    // With a right panel the canvas moves freely in the workspace:
    // rvn-zoom-viewport sets its zoom and position, also live during a
    // gesture, and the dot grid moves with it. Other layouts keep it fitted.
    canvasBackgroundStyle: showRightPanel
      ? "flex: 1 1 auto; min-height: 0; position: relative; overflow: hidden; background-position: var(--canvas-x, 0px) var(--canvas-y, 0px);"
      : "",
    canvasWrapperStyle: showRightPanel
      ? `position: absolute; left: 0; top: 0; width: calc(${canvasFitWidth} * var(--canvas-zoom, 1)); transform: translate(var(--canvas-x, 0px), var(--canvas-y, 0px));`
      : `position: relative; width: ${canvasFitWidth}; margin-left: auto; margin-right: auto;`,
    canvasZoom,
    showCanvasZoomControls: showRightPanel,
    canvasZoomLabel: `${Math.round(canvasZoom * 100)}%`,
    canvasZoomInDisabled: canvasZoom >= CANVAS_ZOOM_LEVELS.at(-1),
    canvasZoomOutDisabled: canvasZoom <= CANVAS_ZOOM_LEVELS[0],
    canvasZoomInLabel: copy.canvasZoomInLabel ?? "Zoom in",
    canvasZoomOutLabel: copy.canvasZoomOutLabel ?? "Zoom out",
    canvasZoomFitLabel: copy.canvasZoomFitLabel ?? "Fit to view",
    undoDisabled: state.editHistory.undo.length === 0,
    redoDisabled: state.editHistory.redo.length === 0,
    undoLabel: editHistoryCopy.undoLabel,
    redoLabel: editHistoryCopy.redoLabel,
    previewData: state.previewData,
    initialPreviewData: state.initialPreviewData,
    previewHydrationData,
    isPreviewMounted: state.isPreviewMounted,
    projectResolution: state.projectResolution,
    layout,
    imagesData: state.images,
    soundsData: state.soundsData,
    spritesheetsData: state.spritesheetsData,
    particlesData: state.particlesData,
    charactersData: state.charactersData,
    textStylesData: state.textStylesData,
    variablesData: state.variablesData,
    layoutsData: state.layoutsData,
    selectedElementMetrics: state.selectedElementMetrics,
    selectedItemIsInsideSaveLoadSlot,
    selectedItemIsInsideDirectedContainer,
    selectedItemIsEffectivelyHidden,
    isInsideSaveLoadSlot: detailPanelIsInsideSaveLoadSlot,
    isInsideDirectedContainer: detailPanelIsInsideDirectedContainer,
    isTouchMode: state.isTouchMode,
    showExplorerPanel: !state.isTouchMode,
    showRightPanel,
    rightPanelMode: state.rightPanelMode,
    rightPanelModeTabs: [
      { id: "edit", label: copy.editModeLabel ?? "Edit" },
      { id: "preview", label: copy.previewTitle ?? "Preview" },
    ],
    rightPanelEditStyle:
      state.rightPanelMode === "edit" ? "" : "display: none;",
    rightPanelPreviewStyle:
      state.rightPanelMode === "preview" ? "" : "display: none;",
    showRightPanelSaveButton: state.rightPanelMode === "preview",
    showPreviewHeader: !showMobileSelectedNodeDetail,
    showTabletLandscapeExplorer,
    tabletLandscapeExplorerWidth: TABLET_LANDSCAPE_EXPLORER_WIDTH,
    showMobilePanels,
    showMobileNodeButton: showMobilePanels,
    nodeButtonVariant: showMobileNodeExplorer ? "pr" : "se",
    nodeMovePreviousLabel: copy.previousElementLabel ?? "Previous element",
    nodeMoveNextLabel: copy.nextElementLabel ?? "Next element",
    showMobilePreviewButton: showMobilePanels && Boolean(item),
    showMobileNodeExplorer,
    showMobileSelectedNodeDetail,
    previewPanelVisibilityStyle,
  };
};
