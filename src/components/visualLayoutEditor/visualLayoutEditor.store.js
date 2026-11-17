import { toFlatItems } from "../../internal/project/tree.js";
import { isStoredVisualLayout } from "../../internal/project/projection.js";
import { CURRENT_LAYOUT_SCHEMA_VERSION } from "../../internal/project/layout.js";
import { DEFAULT_PROJECT_RESOLUTION } from "../../internal/projectResolution.js";
import {
  buildEditorCanvasLayoutForPanel,
  buildEditorCanvasZoomViewData,
  resetEditorCanvasZoomState,
  setEditorCanvasZoomState,
  zoomEditorCanvasInState,
  zoomEditorCanvasOutState,
} from "../../internal/ui/editorCanvasWorkspace.js";
import { selectLayoutEditorPageCopy } from "../../internal/ui/layoutEditor/layoutEditorCopy.js";
import {
  CREATE_TYPE_LABEL_KEYS,
  isItemDirectChildOfDirectedContainer,
  toLayoutEditorContextMenuItems,
  toLayoutEditorExplorerItems,
} from "../../internal/ui/layoutEditor/layoutEditorViewData.js";

// The elements a visual's layout can add: those of a general layout.
const CREATE_TYPES = [
  "container",
  "sprite",
  "spritesheet-animation",
  "particle",
  "video",
  "text",
  "slider",
  "fragment-ref",
];

const CREATE_TYPE_FALLBACK_LABELS = {
  container: "Container",
  sprite: "Image",
  "spritesheet-animation": "Spritesheet Animation",
  particle: "Particle",
  video: "Video",
  text: "Text",
  slider: "Slider",
  "fragment-ref": "Fragment",
};

const EMPTY_COLLECTION = Object.freeze({ items: {}, tree: [] });

const selectComponentCopy = (i18n = {}) => i18n.visualLayoutEditor ?? {};

const createAddElementMenuItems = (copy) => [
  {
    type: "label",
    label: copy.addElementMenuLabel ?? "Add Element",
  },
  ...CREATE_TYPES.map((createType) => ({
    type: "item",
    label:
      copy[CREATE_TYPE_LABEL_KEYS[createType]] ??
      CREATE_TYPE_FALLBACK_LABELS[createType],
    createType,
  })),
];

const createElementMenuItems = (copy) => [
  ...createAddElementMenuItems(copy),
  { type: "separator" },
  { type: "label", label: copy.editMenuLabel ?? "Edit" },
  {
    type: "item",
    label: copy.renameMenuItem ?? "Rename",
    value: "rename-item",
  },
  {
    type: "item",
    label: copy.deleteMenuItem ?? "Delete",
    value: "delete-item",
  },
];

const findLine = (repositoryState, { sceneId, sectionId, lineId }) =>
  repositoryState?.scenes?.items?.[sceneId]?.sections?.items?.[sectionId]?.lines
    ?.items?.[lineId];

export const createInitialState = () => ({
  isTouchMode: false,
  isLoaded: false,
  isMissing: false,
  layoutSchemaVersion: CURRENT_LAYOUT_SCHEMA_VERSION,
  layoutData: { items: {}, tree: [] },
  projectResolution: DEFAULT_PROJECT_RESOLUTION,
  resources: {},
  selectedItemId: undefined,
  selectedElementMetrics: undefined,
  canvasPreviewItem: undefined,
  canvasZoom: 1,
  // Edits not saved yet. A save takes the elements as they are then.
  hasUnsavedEdits: false,
});

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode =
    uiConfig?.id === "touch" || uiConfig?.inputMode === "touch";
};

// Takes the visual's layout, and the project's resources its elements and
// the edit panel use, from the repository. Edits not saved yet are dropped.
export const loadVisualLayout = (
  { state },
  { repositoryState, sceneId, sectionId, lineId, visualId } = {},
) => {
  const visual = findLine(repositoryState, {
    sceneId,
    sectionId,
    lineId,
  })?.actions?.visual?.items?.find((item) => item.id === visualId);
  const layout = visual?.layout;
  // Only a layout in its saved form, elements by id and their tree, can be
  // edited. One already built for the engine is not.
  const elements = isStoredVisualLayout(layout) ? layout.elements : undefined;

  state.isLoaded = true;
  state.isMissing = !elements?.items || !Array.isArray(elements.tree);
  state.layoutData = state.isMissing
    ? structuredClone(EMPTY_COLLECTION)
    : structuredClone(elements);
  state.layoutSchemaVersion =
    layout?.layoutSchemaVersion ?? CURRENT_LAYOUT_SCHEMA_VERSION;
  state.projectResolution =
    repositoryState?.project?.resolution ?? DEFAULT_PROJECT_RESOLUTION;
  state.resources = {
    images: repositoryState?.images ?? EMPTY_COLLECTION,
    sounds: repositoryState?.sounds ?? EMPTY_COLLECTION,
    spritesheets: repositoryState?.spritesheets ?? EMPTY_COLLECTION,
    particles: repositoryState?.particles ?? EMPTY_COLLECTION,
    videos: repositoryState?.videos ?? EMPTY_COLLECTION,
    characters: repositoryState?.characters ?? EMPTY_COLLECTION,
    layouts: repositoryState?.layouts ?? EMPTY_COLLECTION,
    textStyles: repositoryState?.textStyles ?? EMPTY_COLLECTION,
    variables: repositoryState?.variables ?? EMPTY_COLLECTION,
  };
  state.hasUnsavedEdits = false;
  state.canvasPreviewItem = undefined;
  if (state.selectedItemId && !state.layoutData.items[state.selectedItemId]) {
    state.selectedItemId = undefined;
    state.selectedElementMetrics = undefined;
  }
};

// An edit to the elements, kept until it is saved.
// The elements after a change to the tree. A selected element that is gone,
// deleted itself or with its container, is no longer selected.
export const setLayoutElements = ({ state }, { elements } = {}) => {
  state.layoutData = elements;
  state.canvasPreviewItem = undefined;
  state.hasUnsavedEdits = true;
  if (state.selectedItemId && !elements.items[state.selectedItemId]) {
    state.selectedItemId = undefined;
    state.selectedElementMetrics = undefined;
  }
};

export const updateLayoutElement = ({ state }, { itemId, item } = {}) => {
  state.layoutData.items[itemId] = item;
  if (state.canvasPreviewItem?.itemId === itemId) {
    state.canvasPreviewItem = undefined;
  }
  state.hasUnsavedEdits = true;
};

export const markEditsSaved = ({ state }) => {
  state.hasUnsavedEdits = false;
};

export const selectHasUnsavedEdits = ({ state }) => state.hasUnsavedEdits;

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  if (state.selectedItemId !== itemId) {
    state.selectedElementMetrics = undefined;
  }
  state.selectedItemId = itemId;
};

export const setSelectedElementMetrics = ({ state }, { metrics } = {}) => {
  state.selectedElementMetrics = metrics;
};

export const setCanvasPreviewItem = ({ state }, { itemId, item } = {}) => {
  state.canvasPreviewItem = { itemId, item };
};

export const clearCanvasPreviewItem = ({ state }) => {
  state.canvasPreviewItem = undefined;
};

export const selectHasCanvasPreviewItem = ({ state }) =>
  state.canvasPreviewItem !== undefined;

export const zoomCanvasIn = ({ state }) => {
  zoomEditorCanvasInState(state);
};

export const zoomCanvasOut = ({ state }) => {
  zoomEditorCanvasOutState(state);
};

export const setCanvasZoom = ({ state }, payload = {}) => {
  setEditorCanvasZoomState(state, payload);
};

export const resetCanvasZoom = ({ state }) => {
  resetEditorCanvasZoomState(state);
};

export const selectLayoutElements = ({ state }) => state.layoutData;
export const selectSelectedItemId = ({ state }) => state.selectedItemId;
export const selectSelectedItem = ({ state }) =>
  state.layoutData.items[state.selectedItemId];
export const selectItemById = ({ state }, { itemId } = {}) =>
  state.layoutData.items[itemId];
export const selectImages = ({ state }) => state.resources.images;
export const selectTextStyles = ({ state }) => state.resources.textStyles;
// The resources a new element can be made from.
export const selectNewElementResources = ({ state }) => ({
  images: state.resources.images,
  spritesheets: state.resources.spritesheets,
  videos: state.resources.videos,
  particles: state.resources.particles,
  layouts: state.resources.layouts,
});
export const selectProjectResolution = ({ state }) => state.projectResolution;
export const selectSelectedElementMetrics = ({ state }) =>
  state.selectedElementMetrics;
export const selectIsMissing = ({ state }) => state.isMissing;

export const selectViewData = ({ state, props, i18n }) => {
  const layoutCopy = selectLayoutEditorPageCopy(i18n);
  const copy = selectComponentCopy(i18n);
  const contextMenuItems = toLayoutEditorContextMenuItems(
    createElementMenuItems(layoutCopy),
    state.projectResolution,
    layoutCopy,
  );
  const emptyContextMenuItems = toLayoutEditorContextMenuItems(
    createAddElementMenuItems(layoutCopy),
    state.projectResolution,
    layoutCopy,
  );
  const flatItems = toLayoutEditorExplorerItems(toFlatItems(state.layoutData), {
    contextMenuItems,
    copy: layoutCopy,
    alwaysShowVisibilityToggle: state.isTouchMode,
  });
  const parentIdById = Object.fromEntries(
    flatItems.map((flatItem) => [flatItem.id, flatItem.parentId]),
  );
  const selectedItem = state.layoutData.items[state.selectedItemId];
  const selectedItemIsInsideDirectedContainer =
    isItemDirectChildOfDirectedContainer({
      layoutData: state.layoutData,
      parentIdById,
      itemId: selectedItem ? state.selectedItemId : undefined,
    });
  const selectedItemIsHidden =
    flatItems.find((flatItem) => flatItem.id === state.selectedItemId)
      ?.effectivelyHidden === true;
  const elements = state.canvasPreviewItem
    ? {
        ...state.layoutData,
        items: {
          ...state.layoutData.items,
          [state.canvasPreviewItem.itemId]: state.canvasPreviewItem.item,
        },
      }
    : state.layoutData;
  const { canvasBackgroundStyle, canvasWrapperStyle } =
    buildEditorCanvasLayoutForPanel({
      showRightPanel: true,
      resolution: state.projectResolution,
    });

  return {
    isLoaded: state.isLoaded,
    isMissing: state.isMissing,
    cannotEditLabel:
      copy.cannotEditLayout ??
      "This visual's layout can't be edited. Add the visual again to edit its layout.",
    title: copy.title ?? "Edit Layout",
    doneButton: copy.doneButton ?? "Done",
    elementsTitle: layoutCopy.nodeExplorerTitle ?? "Elements",
    noSelectionLabel: layoutCopy.noSelectionLabel ?? "No selection",
    flatItems,
    contextMenuItems,
    emptyContextMenuItems,
    projectResolution: state.projectResolution,
    // The canvas draws the layout as one layout, named after the visual.
    layoutState: {
      id: props.visualId,
      layoutType: "general",
      layoutSchemaVersion: state.layoutSchemaVersion,
      elements,
    },
    sceneBackdrop: props.sceneBackdrop,
    selectedItemId: selectedItem ? state.selectedItemId : undefined,
    selectedItem,
    selectedElementMetrics: state.selectedElementMetrics,
    selectedItemIsInsideDirectedContainer,
    // A visual's layout has no save/load slots.
    isInsideSaveLoadSlot: false,
    allowAutoSlot: false,
    canvasDisableInteraction: selectedItemIsHidden,
    ...buildEditorCanvasZoomViewData(state.canvasZoom, i18n.dateTime),
    canvasZoomInLabel: layoutCopy.canvasZoomInLabel ?? "Zoom in",
    canvasZoomOutLabel: layoutCopy.canvasZoomOutLabel ?? "Zoom out",
    canvasZoomFitLabel: layoutCopy.canvasZoomFitLabel ?? "Fit to view",
    canvasBackgroundStyle,
    canvasWrapperStyle,
    imagesData: state.resources.images,
    soundsData: state.resources.sounds,
    spritesheetsData: state.resources.spritesheets,
    particlesData: state.resources.particles,
    videosData: state.resources.videos,
    charactersData: state.resources.characters,
    textStylesData: state.resources.textStyles,
    variablesData: state.resources.variables,
    layoutsData: state.resources.layouts,
  };
};
