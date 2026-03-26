import { createCatalogPageStore } from "../../internal/ui/resourcePages/catalog/createCatalogPageStore.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import {
  DEFAULT_PROJECT_RESOLUTION,
  formatProjectResolutionAspectRatio,
  requireProjectResolution,
} from "../../internal/projectResolution.js";

const createTransformForm = ({
  editMode = false,
  projectResolution = DEFAULT_PROJECT_RESOLUTION,
} = {}) => {
  const resolvedProjectResolution = requireProjectResolution(
    projectResolution,
    "Project resolution",
  );

  return {
    title: editMode ? "Edit Transform" : "Add Transform",
    fields: [
      {
        name: "name",
        type: "input-text",
        label: "Name",
        required: true,
      },
      {
        name: "x",
        type: "slider-with-input",
        min: 0,
        max: resolvedProjectResolution.width,
        step: 1,
        label: "Position X",
        required: true,
      },
      {
        name: "y",
        type: "slider-with-input",
        min: 0,
        max: resolvedProjectResolution.height,
        step: 1,
        label: "Position Y",
        required: true,
      },
      {
        name: "scaleX",
        type: "slider-with-input",
        min: 0.1,
        max: 3,
        step: 0.1,
        label: "Scale X",
        required: true,
      },
      {
        name: "scaleY",
        type: "slider-with-input",
        min: 0.1,
        max: 3,
        step: 0.1,
        label: "Scale Y",
        required: true,
      },
      {
        name: "anchor",
        type: "select",
        label: "Anchor",
        placeholder: "Choose an anchor",
        options: [
          { id: "tl", label: "Top Left", value: { anchorX: 0, anchorY: 0 } },
          {
            id: "tc",
            label: "Top Center",
            value: { anchorX: 0.5, anchorY: 0 },
          },
          { id: "tr", label: "Top Right", value: { anchorX: 1, anchorY: 0 } },
          {
            id: "cl",
            label: "Center Left",
            value: { anchorX: 0, anchorY: 0.5 },
          },
          {
            id: "cc",
            label: "Center Center",
            value: { anchorX: 0.5, anchorY: 0.5 },
          },
          {
            id: "cr",
            label: "Center Right",
            value: { anchorX: 1, anchorY: 0.5 },
          },
          {
            id: "bl",
            label: "Bottom Left",
            value: { anchorX: 0, anchorY: 1 },
          },
          {
            id: "bc",
            label: "Bottom Center",
            value: { anchorX: 0.5, anchorY: 1 },
          },
          {
            id: "br",
            label: "Bottom Right",
            value: { anchorX: 1, anchorY: 1 },
          },
        ],
        required: true,
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "submit",
          variant: "pr",
          label: editMode ? "Update Transform" : "Add Transform",
        },
      ],
    },
  };
};

const createDialogDefaultValues = (item) => ({
  name: item?.name ?? "",
  x: String(item?.x ?? 0),
  y: String(item?.y ?? 0),
  scaleX: String(item?.scaleX ?? 1),
  scaleY: String(item?.scaleY ?? 1),
  anchor: {
    anchorX: item?.anchorX ?? 0,
    anchorY: item?.anchorY ?? 0,
  },
});

const buildDetailFields = (item) => {
  if (!item) {
    return [];
  }

  return [
    {
      type: "slot",
      slot: "transform-preview",
      label: "",
    },
    {
      type: "text",
      label: "Position X",
      value: String(item.x ?? 0),
    },
    {
      type: "text",
      label: "Position Y",
      value: String(item.y ?? 0),
    },
    {
      type: "text",
      label: "Scale X",
      value: String(item.scaleX ?? 1),
    },
    {
      type: "text",
      label: "Scale Y",
      value: String(item.scaleY ?? 1),
    },
    {
      type: "text",
      label: "Anchor X",
      value: String(item.anchorX ?? 0),
    },
    {
      type: "text",
      label: "Anchor Y",
      value: String(item.anchorY ?? 0),
    },
  ];
};

const buildCatalogItem = (item) => ({
  ...item,
  cardKind: "transform",
});

const {
  createInitialState: createCatalogInitialState,
  setItems,
  setSelectedItemId,
  selectSelectedItem,
  selectItemById,
  selectSelectedItemId,
  setSearchQuery,
  selectViewData: selectCatalogViewData,
} = createCatalogPageStore({
  itemType: "transform",
  resourceType: "transforms",
  title: "Transforms",
  selectedResourceId: "transforms",
  resourceCategory: "assets",
  addText: "Add Transform",
  emptyMessage: "No transforms found",
  buildDetailFields,
  buildCatalogItem,
  extendViewData: ({ state, selectedItem, baseViewData }) => ({
    ...baseViewData,
    isDialogOpen: state.isDialogOpen,
    transformForm: state.transformForm,
    dialogDefaultValues: state.dialogDefaultValues,
    canvasAspectRatio: formatProjectResolutionAspectRatio(
      state.projectResolution,
    ),
    projectResolution: state.projectResolution,
    selectedItem,
  }),
});

export const createInitialState = () => ({
  ...createCatalogInitialState(),
  isDialogOpen: false,
  targetGroupId: undefined,
  editMode: false,
  editItemId: undefined,
  projectResolution: DEFAULT_PROJECT_RESOLUTION,
  dialogDefaultValues: createDialogDefaultValues(),
  transformForm: createTransformForm(),
});

export {
  setItems,
  setSelectedItemId,
  selectSelectedItem,
  selectSelectedItemId,
  setSearchQuery,
};

export const selectTransformItemById = selectItemById;

export const setProjectResolution = ({ state }, { projectResolution } = {}) => {
  state.projectResolution = requireProjectResolution(
    projectResolution,
    "Project resolution",
  );

  state.transformForm = createTransformForm({
    editMode: state.editMode,
    projectResolution: state.projectResolution,
  });
};

export const openTransformFormDialog = ({ state }, options = {}) => {
  const {
    editMode = false,
    itemId = undefined,
    itemData = undefined,
    targetGroupId = undefined,
  } = options;

  state.isDialogOpen = true;
  state.editMode = editMode;
  state.editItemId = itemId;
  state.targetGroupId = targetGroupId === "_root" ? undefined : targetGroupId;
  state.dialogDefaultValues = createDialogDefaultValues(itemData);
  state.transformForm = createTransformForm({
    editMode,
    projectResolution: state.projectResolution,
  });
};

export const closeTransformFormDialog = ({ state }, _payload = {}) => {
  state.isDialogOpen = false;
  state.targetGroupId = undefined;
  state.editMode = false;
  state.editItemId = undefined;
  state.dialogDefaultValues = createDialogDefaultValues();
  state.transformForm = createTransformForm({
    projectResolution: state.projectResolution,
  });
};

export const selectTargetGroupId = ({ state }) => {
  return state.targetGroupId;
};

export const selectEditMode = ({ state }) => {
  return state.editMode;
};

export const selectEditItemId = ({ state }) => {
  return state.editItemId;
};

export const selectProjectResolution = ({ state }) => {
  return state.projectResolution;
};

export const selectViewData = (context) => {
  const viewData = selectCatalogViewData(context);

  return {
    ...viewData,
    flatItems: applyFolderRequiredRootDragOptions(viewData.flatItems),
  };
};
