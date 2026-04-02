import { parseAndRender } from "jempl";
import { toFlatItems } from "../../internal/project/tree.js";
import {
  DEFAULT_PROJECT_RESOLUTION,
  requireProjectResolution,
} from "../../internal/projectResolution.js";
import {
  isItemInsideSaveLoadSlot,
  selectLayoutEditorSelectedItem,
  toLayoutEditorContextMenuItems,
  toLayoutEditorExplorerItems,
} from "../../internal/ui/layoutEditor/layoutEditorViewData.js";

export const createInitialState = () => {
  return {
    lastUpdateDate: undefined,
    layoutData: { tree: [], items: {} },
    selectedItemId: undefined,
    layout: undefined,
    images: { tree: [], items: {} },
    layoutsData: { tree: [], items: {} },
    textStylesData: { tree: [], items: {} },
    colorsData: { tree: [], items: {} },
    fontsData: { tree: [], items: {} },
    variablesData: { tree: [], items: {} },
    previewData: {},
    projectResolution: DEFAULT_PROJECT_RESOLUTION,
  };
};

export const setItems = ({ state }, { layoutData } = {}) => {
  state.layoutData = layoutData;
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
  state.layout.layoutType =
    nextResourceType === "controls"
      ? layout?.layoutType
      : (layout?.layoutType ?? "normal");
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
};

export const setPreviewData = ({ state }, { previewData } = {}) => {
  state.previewData = previewData ?? {};
};

export const updateSelectedItem = ({ state }, { updatedItem } = {}) => {
  if (state.selectedItemId && state.layoutData && state.layoutData.items) {
    state.layoutData.items[state.selectedItemId] = updatedItem;
  }
  state.lastUpdateDate = Date.now();
};

export const setImages = ({ state }, { images } = {}) => {
  state.images = images;
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
    layoutsData,
    textStylesData,
    colorsData,
    fontsData,
    variablesData,
  } = payload;

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
  state.layoutsData = layoutsData ?? { items: {}, tree: [] };
  state.textStylesData = textStylesData ?? { items: {}, tree: [] };
  state.colorsData = colorsData ?? { items: {}, tree: [] };
  state.fontsData = fontsData ?? { items: {}, tree: [] };
  state.variablesData = variablesData ?? { items: {}, tree: [] };
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
export const selectLayoutsData = ({ state }) => state.layoutsData;

export const selectSelectedItem = ({ state }) => {
  return selectLayoutEditorSelectedItem({ state });
};

export const selectSelectedItemData = ({ state }) => {
  if (!state.selectedItemId) {
    return undefined;
  }

  const item = state.layoutData?.items?.[state.selectedItemId];
  if (!item) {
    return undefined;
  }

  return {
    id: state.selectedItemId,
    ...item,
  };
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

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

export const selectViewData = ({ state, constants }) => {
  const item = selectSelectedItem({ state });
  const flatItems = toLayoutEditorExplorerItems(toFlatItems(state.layoutData));
  const parentIdById = Object.fromEntries(
    flatItems.map((flatItem) => [flatItem.id, flatItem.parentId]),
  );
  const isControlResource = state.layout?.resourceType === "controls";
  const layoutType = state.layout?.layoutType;
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
      elements: state.layoutData,
    };
  }
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

  return {
    item,
    layoutEditPanelKey: `${item?.id}-${state.lastUpdateDate}`,
    flatItems,
    selectedItemId: state.selectedItemId,
    resourceCategory: isControlResource ? "systemConfig" : "userInterface",
    selectedResourceId: isControlResource ? "controls" : "layout-editor",
    contextMenuItems: toLayoutEditorContextMenuItems(
      parsedContextMenuItems,
      state.projectResolution,
    ),
    emptyContextMenuItems: toLayoutEditorContextMenuItems(
      parsedEmptyContextMenuItems,
      state.projectResolution,
    ),
    layoutState,
    previewData: state.previewData,
    projectResolution: state.projectResolution,
    layout,
    textStylesData: state.textStylesData,
    variablesData: state.variablesData,
    layoutsData: state.layoutsData,
    isInsideSaveLoadSlot: isItemInsideSaveLoadSlot({
      layoutData: state.layoutData,
      parentIdById,
      itemId: item?.id,
    }),
  };
};
