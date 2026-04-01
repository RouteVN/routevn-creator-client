import { parseAndRender } from "jempl";
import { toFlatItems } from "../../project/tree.js";
import {
  getLayoutEditorCreateDefinition,
  getLayoutEditorElementDefinition,
} from "../../layoutEditorElementRegistry.js";
import { getFragmentLayoutOptions } from "../../layoutFragments.js";
import {
  DEFAULT_PROJECT_RESOLUTION,
  formatProjectResolutionAspectRatio,
} from "../../projectResolution.js";
import { normalizeLayoutType } from "../../project/layout.js";
import {
  createChoiceFormDefaultValues,
  createNvlFormDefaultValues,
  createPreviewVariablesViewData,
  createSaveLoadPreviewViewData,
} from "./preview/index.js";

const toLayoutEditorContextMenuItems = (
  items = [],
  projectResolution = DEFAULT_PROJECT_RESOLUTION,
) => {
  return items.map((item) => {
    if (!item?.createType) {
      return item;
    }

    const { createType, ...nextItem } = item;
    const createDefinition = getLayoutEditorCreateDefinition(createType, {
      projectResolution,
    });

    return {
      ...nextItem,
      value: {
        action: "new-child-item",
        ...createDefinition.template,
      },
    };
  });
};

export const toLayoutEditorExplorerItems = (items = []) => {
  return (items ?? []).map((item) => ({
    ...item,
    dragOptions: {
      ...item.dragOptions,
      canReceiveChildren: getLayoutEditorElementDefinition(item.type)
        .isContainer,
    },
  }));
};

export const selectLayoutEditorSelectedItem = ({ state }) => {
  if (!state.selectedItemId) {
    return undefined;
  }

  const flatItems = toLayoutEditorExplorerItems(toFlatItems(state.layoutData));
  const item = flatItems.find((entry) => entry.id === state.selectedItemId);
  if (!item) {
    return undefined;
  }

  return {
    ...item,
    anchor: {
      x: item.anchorX,
      y: item.anchorY,
    },
  };
};

export const selectLayoutEditorSaveLoadData = ({ state }) => {
  const saveLoadPreviewData = createSaveLoadPreviewViewData({
    currentLayoutId: state.layout?.id,
    currentLayoutData: state.layoutData,
    currentLayoutType: normalizeLayoutType(state.layout?.layoutType),
    layoutsData: state.layoutsData,
    saveLoadDefaultValues: state.saveLoadDefaultValues,
    previewVariableValues: state.previewVariableValues,
    variablesData: state.variablesData,
    images: state.images,
  });
  const slots = saveLoadPreviewData.visibleSaveLoadSlots;

  return {
    slots,
  };
};

export const selectLayoutEditorHasSaveLoadPreview = ({ state }) => {
  return createSaveLoadPreviewViewData({
    currentLayoutId: state.layout?.id,
    currentLayoutData: state.layoutData,
    currentLayoutType: normalizeLayoutType(state.layout?.layoutType),
    layoutsData: state.layoutsData,
    saveLoadDefaultValues: state.saveLoadDefaultValues,
    previewVariableValues: state.previewVariableValues,
    variablesData: state.variablesData,
    images: state.images,
  }).hasSaveLoadPreview;
};

const isItemInsideSaveLoadSlot = ({ layoutData, parentIdById, itemId }) => {
  if (!itemId) {
    return false;
  }

  let currentParentId = parentIdById[itemId];

  while (currentParentId) {
    if (
      layoutData?.items?.[currentParentId]?.type ===
      "container-ref-save-load-slot"
    ) {
      return true;
    }

    currentParentId = parentIdById[currentParentId];
  }

  return false;
};

export const selectLayoutEditorViewData = ({ state, constants }) => {
  const item = selectLayoutEditorSelectedItem({ state });
  const flatItems = toLayoutEditorExplorerItems(toFlatItems(state.layoutData));
  const parentIdById = Object.fromEntries(
    flatItems.map((flatItem) => [flatItem.id, flatItem.parentId]),
  );
  const isControlResource = state.layout?.resourceType === "controls";
  const layoutType = normalizeLayoutType(state.layout?.layoutType);
  const layout =
    state.layout === undefined
      ? undefined
      : {
          ...state.layout,
          layoutType,
        };
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
  const previewVariablesViewData = createPreviewVariablesViewData({
    layoutType,
    currentLayoutId: state.layout?.id,
    currentLayoutData: state.layoutData,
    layoutsData: state.layoutsData,
    variablesData: state.variablesData,
    previewVariableValues: state.previewVariableValues,
  });
  const fragmentLayoutOptions = getFragmentLayoutOptions(state.layoutsData, {
    excludeLayoutId: state.layout?.id,
  });
  const saveLoadPreviewViewData = createSaveLoadPreviewViewData({
    currentLayoutId: state.layout?.id,
    currentLayoutData: state.layoutData,
    currentLayoutType: layoutType,
    layoutsData: state.layoutsData,
    saveLoadDefaultValues: state.saveLoadDefaultValues,
    previewVariableValues: state.previewVariableValues,
    variablesData: state.variablesData,
    images: state.images,
    saveLoadForm: constants.saveLoadForm,
  });

  return {
    item,
    canvasCursor: state.isDragging ? "all-scroll" : "default",
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
    dialogueForm: constants.dialogueForm,
    dialogueDefaultValues: state.dialogueDefaultValues,
    nvlForm: constants.nvlForm,
    nvlDefaultValues: createNvlFormDefaultValues(state.nvlDefaultValues),
    nvlContext: {
      ...state.nvlDefaultValues,
    },
    previewRevealingSpeed: state.previewRevealingSpeed,
    choiceForm: constants.choiceForm,
    choiceDefaultValues: createChoiceFormDefaultValues(
      state.choiceDefaultValues,
    ),
    choicesContext: {
      ...state.choiceDefaultValues,
    },
    saveLoadForm: saveLoadPreviewViewData.saveLoadForm,
    saveLoadDefaultValues: saveLoadPreviewViewData.saveLoadDefaultValues,
    saveLoadContext: saveLoadPreviewViewData.saveLoadContext,
    saveLoadFormKey: saveLoadPreviewViewData.saveLoadFormKey,
    hasSaveLoadPreview: saveLoadPreviewViewData.hasSaveLoadPreview,
    previewVariablesForm: previewVariablesViewData.previewVariablesForm,
    previewVariablesDefaultValues:
      previewVariablesViewData.previewVariablesDefaultValues,
    previewVariablesFormKey: previewVariablesViewData.previewVariablesFormKey,
    hasPreviewVariables: previewVariablesViewData.hasPreviewVariables,
    sliderCreateForm: constants.sliderCreateForm,
    sliderCreateDialog: state.sliderCreateDialog,
    sliderCreateImageSelectorDialog: state.sliderCreateImageSelectorDialog,
    fragmentCreateForm: parseAndRender(constants.fragmentCreateForm, {
      fragmentLayoutOptions,
    }),
    fragmentCreateDialog: state.fragmentCreateDialog,
    fragmentLayoutOptions,
    canvasAspectRatio: formatProjectResolutionAspectRatio(
      state.projectResolution,
    ),
    layout,
    textStylesData: state.textStylesData,
    variablesData: state.variablesData,
    layoutsData: state.layoutsData,
    isInsideSaveLoadSlot: isItemInsideSaveLoadSlot({
      layoutData: state.layoutData,
      parentIdById,
      itemId: item?.id,
    }),
    images: state.images,
  };
};
