import { toFlatItems } from "../../internal/project/tree.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import { createCatalogPageStore } from "../../internal/ui/resourcePages/catalog/createCatalogPageStore.js";
import { createTagField } from "../../internal/ui/resourcePages/tags.js";
import {
  DEFAULT_PROJECT_RESOLUTION,
  formatProjectResolutionAspectRatio,
  requireProjectResolution,
} from "../../internal/projectResolution.js";
import {
  formatAnimationDurationLabel,
  toAnimationDisplayItem,
} from "../../internal/animationDisplay.js";
import { matchesTagAwareSearch } from "../../internal/resourceTags.js";

export const ANIMATION_TAG_SCOPE_KEY = "animations";

const EMPTY_TREE = {
  items: {},
  tree: [],
};

const editForm = {
  title: "Edit Animation",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: "Name",
      required: true,
    },
    {
      name: "description",
      type: "input-textarea",
      label: "Description",
      required: false,
    },
    createTagField(),
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: "Update Animation",
      },
    ],
  },
};

const addForm = {
  title: "Add Animation",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: "Name",
      required: true,
    },
    {
      name: "description",
      type: "input-textarea",
      label: "Description",
      required: false,
    },
    createTagField(),
    {
      name: "dialogType",
      type: "segmented-control",
      label: "Type",
      noClear: true,
      required: true,
      options: [
        {
          label: "Update",
          value: "update",
        },
        {
          label: "Transition",
          value: "transition",
        },
      ],
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: "Continue",
      },
    ],
  },
};

const animationExplorerItemContextMenuItems = [
  { label: "Edit", type: "item", value: "edit-item" },
  { label: "Rename", type: "item", value: "rename-item" },
  { label: "Duplicate", type: "item", value: "duplicate-item" },
  { label: "Delete", type: "item", value: "delete-item" },
];

const animationCenterItemContextMenuItems = [
  { label: "Edit", type: "item", value: "edit-item" },
  { label: "Duplicate", type: "item", value: "duplicate-item" },
  { label: "Delete", type: "item", value: "delete-item" },
];

const buildCatalogItem = (item) => {
  return toAnimationDisplayItem(item);
};

const matchesSearch = matchesTagAwareSearch;

const {
  createInitialState: createCatalogInitialState,
  setItems: setBaseItems,
  setSelectedItemId: setBaseSelectedItemId,
  setSelectedFolderId: setBaseSelectedFolderId,
  setUiConfig,
  openMobileFileExplorer,
  closeMobileFileExplorer,
  selectSelectedItem,
  selectItemById,
  selectFolderById,
  selectSelectedItemId,
  selectSelectedFolderId,
  setSearchQuery,
  setTagsData,
  setActiveTagIds,
  setDetailTagIds,
  commitDetailTagIds,
  setDetailTagPopoverOpen,
  openCreateTagDialog,
  closeCreateTagDialog,
  openFolderNameDialog,
  closeFolderNameDialog,
  selectViewData: selectCatalogViewData,
} = createCatalogPageStore({
  itemType: "animation",
  resourceType: "animations",
  title: "Animations",
  selectedResourceId: "animations",
  resourceCategory: "animatedAssets",
  addText: "Add",
  centerItemContextMenuItems: animationCenterItemContextMenuItems,
  buildCatalogItem,
  matchesSearch,
  tagging: {
    tagFilterPlaceholder: "Filter tags",
  },
  extendViewData: ({ state, selectedItem, baseViewData }) => {
    const selectedAnimationItem = selectedItem
      ? toAnimationDisplayItem(selectedItem)
      : undefined;

    return {
      ...baseViewData,
      isAddDialogOpen: state.isAddDialogOpen,
      addForm,
      addFormDefaults: {
        name: "",
        description: "",
        tagIds: [],
        dialogType: "update",
      },
      isEditDialogOpen: state.isEditDialogOpen,
      editForm,
      editDefaultValues: state.editDefaultValues,
      itemContextMenuItems: animationExplorerItemContextMenuItems,
      selectedAnimationTypeLabel:
        selectedAnimationItem?.animationTypeLabel ?? "",
      selectedAnimationPreviewAspectRatio: formatProjectResolutionAspectRatio(
        state.projectResolution,
      ),
      animationPreviewOpacity: state.animationPreviewVisible ? 1 : 0,
      selectedItemDescription: selectedAnimationItem?.description ?? "",
      selectedItemDuration: formatAnimationDurationLabel(
        selectedAnimationItem?.duration,
      ),
    };
  },
});

export const createInitialState = () => ({
  ...createCatalogInitialState(),
  isAddDialogOpen: false,
  targetGroupId: undefined,
  isEditDialogOpen: false,
  editItemId: undefined,
  projectResolution: DEFAULT_PROJECT_RESOLUTION,
  imagesData: EMPTY_TREE,
  previewRuntimeTarget: undefined,
  previewRuntimeWidth: undefined,
  previewRuntimeHeight: undefined,
  animationPreviewFrameId: undefined,
  animationPreviewStartedAtMs: undefined,
  animationPreviewRequestId: undefined,
  animationPreviewVisible: false,
  editDefaultValues: {
    name: "",
    description: "",
    tagIds: [],
  },
});
export {
  setBaseItems as setItems,
  setBaseSelectedItemId as setSelectedItemId,
  setBaseSelectedFolderId as setSelectedFolderId,
  setUiConfig,
  openMobileFileExplorer,
  closeMobileFileExplorer,
  selectSelectedItem,
  selectFolderById,
  setTagsData,
  setActiveTagIds,
  setDetailTagIds,
  commitDetailTagIds,
  setDetailTagPopoverOpen,
  openCreateTagDialog,
  closeCreateTagDialog,
  openFolderNameDialog,
  closeFolderNameDialog,
  selectSelectedItemId,
  selectSelectedFolderId,
  setSearchQuery,
};

export const selectAnimationItemById = selectItemById;
export const selectSelectedAnimation = selectSelectedItem;

export const setProjectResolution = ({ state }, { projectResolution } = {}) => {
  state.projectResolution = requireProjectResolution(
    projectResolution,
    "Project resolution",
  );
};

export const setImagesData = ({ state }, { imagesData } = {}) => {
  state.imagesData = imagesData ?? EMPTY_TREE;
};

export const setPreviewRuntime = (
  { state },
  { target, width, height } = {},
) => {
  state.previewRuntimeTarget = target;
  state.previewRuntimeWidth = width;
  state.previewRuntimeHeight = height;
};

export const clearPreviewRuntime = ({ state }, _payload = {}) => {
  state.previewRuntimeTarget = undefined;
  state.previewRuntimeWidth = undefined;
  state.previewRuntimeHeight = undefined;
};

export const setAnimationPreviewFrameId = ({ state }, { frameId } = {}) => {
  state.animationPreviewFrameId = frameId;
};

export const clearAnimationPreviewPlayback = ({ state }, _payload = {}) => {
  state.animationPreviewFrameId = undefined;
  state.animationPreviewStartedAtMs = undefined;
};

export const setAnimationPreviewStartedAtMs = (
  { state },
  { startedAtMs } = {},
) => {
  state.animationPreviewStartedAtMs = startedAtMs;
};

export const setAnimationPreviewRequestId = ({ state }, { requestId } = {}) => {
  state.animationPreviewRequestId = requestId;
};

export const setAnimationPreviewVisible = ({ state }, { visible } = {}) => {
  state.animationPreviewVisible = visible === true;
};

export const selectProjectResolution = ({ state }) => state.projectResolution;
export const selectImagesData = ({ state }) => state.imagesData;
export const selectPreviewRuntime = ({ state }) => ({
  target: state.previewRuntimeTarget,
  width: state.previewRuntimeWidth,
  height: state.previewRuntimeHeight,
});
export const selectAnimationPreviewFrameId = ({ state }) =>
  state.animationPreviewFrameId;
export const selectAnimationPreviewStartedAtMs = ({ state }) =>
  state.animationPreviewStartedAtMs;
export const selectAnimationPreviewRequestId = ({ state }) =>
  state.animationPreviewRequestId;

export const selectAnimationDisplayItemById = ({ state }, { itemId } = {}) => {
  const rawItem = toFlatItems(state.data).find(
    (item) => item.id === itemId && item.type === "animation",
  );
  return rawItem ? toAnimationDisplayItem(rawItem) : undefined;
};

export const openAddDialog = ({ state }, { groupId } = {}) => {
  state.isAddDialogOpen = true;
  state.targetGroupId = groupId === "_root" ? undefined : groupId;
};

export const closeAddDialog = ({ state }) => {
  state.isAddDialogOpen = false;
  state.targetGroupId = undefined;
};

export const selectTargetGroupId = ({ state }) => {
  return state.targetGroupId;
};

export const openEditDialog = ({ state }, { itemId, defaultValues } = {}) => {
  state.isEditDialogOpen = true;
  state.editItemId = itemId;
  state.editDefaultValues = {
    name: defaultValues?.name ?? "",
    description: defaultValues?.description ?? "",
    tagIds: defaultValues?.tagIds ?? [],
  };
};

export const closeEditDialog = ({ state }) => {
  state.isEditDialogOpen = false;
  state.editItemId = undefined;
  state.editDefaultValues = {
    name: "",
    description: "",
    tagIds: [],
  };
};

export const selectViewData = (context) => {
  const viewData = selectCatalogViewData(context);

  return {
    ...viewData,
    flatItems: applyFolderRequiredRootDragOptions(viewData.flatItems),
  };
};
