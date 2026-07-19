import { parseAndRender } from "jempl";
import { toFlatItems } from "../../internal/project/tree.js";
import {
  DEFAULT_PROJECT_RESOLUTION,
  requireProjectResolution,
} from "../../internal/projectResolution.js";
import { isTouchUiConfig } from "../../internal/ui/resourcePages/mobileResourcePage.js";
import {
  isItemDirectChildOfDirectedContainer,
  isItemInsideSaveLoadSlot,
  selectLayoutEditorSelectedItem,
  toLayoutEditorContextMenuItems,
  toLayoutEditorExplorerItems,
} from "./support/layoutEditorViewData.js";
import { selectLayoutEditorPageCopy } from "./support/layoutEditorPageCopy.js";

const normalizePreviewData = (previewData) => {
  return previewData && typeof previewData === "object"
    ? structuredClone(previewData)
    : {};
};

const arePreviewDataEqual = (left, right) => {
  return JSON.stringify(left ?? {}) === JSON.stringify(right ?? {});
};

const selectCanvasAspectRatioWidthMultiplier = ({ state }) => {
  const projectResolution = requireProjectResolution(
    state.projectResolution ?? DEFAULT_PROJECT_RESOLUTION,
    "Project resolution",
  );
  const width = Number(projectResolution.width);
  const height = Number(projectResolution.height);
  const ratio = width / height;

  return Number.isFinite(ratio) && ratio > 0 ? ratio : 16 / 9;
};

const selectLayoutEditorCanvasMaxWidth = ({ state }) => {
  const widthMultiplier = selectCanvasAspectRatioWidthMultiplier({ state });
  const maxWidthVh = Number((widthMultiplier * 50).toFixed(4));

  return `min(100%, ${maxWidthVh}vh)`;
};

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
    isMobileFileExplorerOpen: false,
    projectResolution: DEFAULT_PROJECT_RESOLUTION,
    selectedElementMetrics: undefined,
    lastPersistErrorAt: 0,
    pendingPersistPayload: undefined,
  };
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

export const openMobileFileExplorer = ({ state }, _payload = {}) => {
  state.isMobileFileExplorerOpen = true;
};

export const closeMobileFileExplorer = ({ state }, _payload = {}) => {
  state.isMobileFileExplorerOpen = false;
};

export const updateSelectedItem = ({ state }, { itemId, updatedItem } = {}) => {
  const targetItemId = itemId ?? state.selectedItemId;

  if (targetItemId && state.layoutData && state.layoutData.items) {
    state.layoutData.items[targetItemId] = updatedItem;
  }
  state.lastUpdateDate = Date.now();
  state.selectedElementMetrics = undefined;
};

export const setSelectedElementMetrics = ({ state }, { metrics } = {}) => {
  state.selectedElementMetrics = metrics;
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
export const selectIsMobileFileExplorerOpen = ({ state }) =>
  state.isMobileFileExplorerOpen;

export const selectViewData = ({ state, constants, i18n }) => {
  const copy = selectLayoutEditorPageCopy(i18n);
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
      elements: state.layoutData,
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
  const showMobileSelectedNodeDetail = state.isTouchMode && Boolean(item);
  const previewPanelVisibilityStyle = showMobileSelectedNodeDetail
    ? "display: none;"
    : "";
  const previewHydrationData = state.isTouchMode
    ? state.previewData
    : state.initialPreviewData;

  return {
    item,
    loadingPreviewLabel: copy.loadingPreviewLabel,
    noSelectionLabel: copy.noSelectionLabel,
    nodeButtonLabel: copy.nodeButtonLabel ?? "Node",
    nodeExplorerTitle: copy.nodeExplorerTitle ?? copy.nodeButtonLabel ?? "Node",
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
    layoutEditorCanvasMaxWidth: selectLayoutEditorCanvasMaxWidth({ state }),
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
    showDetailPanel: !state.isTouchMode,
    showTopSavePreviewButton: !state.isTouchMode,
    showMobilePreviewHeader: state.isTouchMode && !showMobileSelectedNodeDetail,
    showMobileNodeButton: state.isTouchMode,
    showMobilePreviewButton: showMobileSelectedNodeDetail,
    showMobileNodeExplorer: state.isTouchMode && state.isMobileFileExplorerOpen,
    showMobileSelectedNodeDetail,
    previewPanelVisibilityStyle,
  };
};
