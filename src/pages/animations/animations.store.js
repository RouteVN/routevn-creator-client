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
import {
  createDefaultInitialValuesByProperty,
  createPropertyFieldConfig,
} from "../../internal/animationPreview.js";
import { matchesTagAwareSearch } from "../../internal/resourceTags.js";
import { selectAnimationsPageCopy } from "./support/animationsPageCopy.js";

export const ANIMATION_TAG_SCOPE_KEY = "animations";

const EMPTY_TREE = {
  items: {},
  tree: [],
};

const getAnimationTypeLabel = (animationType, copy = {}) => {
  return animationType === "transition"
    ? (copy.transitionType ?? "Transition")
    : (copy.updateType ?? "Update");
};

const createEditForm = (copy = {}) => ({
  title: copy.editTitle ?? "Edit Animation",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: copy.nameLabel ?? "Name",
      required: true,
    },
    {
      name: "description",
      type: "input-textarea",
      label: copy.descriptionLabel ?? "Description",
      required: false,
    },
    createTagField({
      label: copy.tagsLabel,
      placeholder: copy.selectTagsPlaceholder,
      addOptionLabel: copy.addTagOption,
    }),
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: copy.updateButton ?? "Update Animation",
      },
    ],
  },
});

const createAddForm = (copy = {}) => ({
  title: copy.addTitle ?? "Add Animation",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: copy.nameLabel ?? "Name",
      required: true,
    },
    {
      name: "description",
      type: "input-textarea",
      label: copy.descriptionLabel ?? "Description",
      required: false,
    },
    createTagField({
      label: copy.tagsLabel,
      placeholder: copy.selectTagsPlaceholder,
      addOptionLabel: copy.addTagOption,
    }),
    {
      name: "dialogType",
      type: "segmented-control",
      label: copy.typeLabel ?? "Type",
      noClear: true,
      required: true,
      options: [
        {
          label: copy.updateType ?? "Update",
          value: "update",
        },
        {
          label: copy.transitionType ?? "Transition",
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
        label: copy.continueButton ?? "Continue",
      },
    ],
  },
});

const IMPORT_FOLDER_ROOT_VALUE = "_root";
const IMPORT_DIALOG_SOURCE_STEP = "source";
const IMPORT_DIALOG_DESTINATION_STEP = "destination";

const createImportFolderOptions = (collection) =>
  toFlatItems(collection)
    .filter((item) => item.type === "folder")
    .map((folder) => ({
      value: folder.id,
      label: folder.fullLabel || folder.name || folder.id,
    }));

const createAnimationImportSourceForm = (copy = {}) => ({
  title: copy.importTitle ?? "Import Animation",
  fields: [
    {
      name: "url",
      type: "input-text",
      label: copy.urlLabel ?? "URL",
      required: {
        message: copy.importUrlRequired ?? "Import URL is required.",
      },
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "continue",
        variant: "pr",
        label: copy.continueButton ?? "Continue",
        validate: true,
      },
    ],
  },
});

const createAnimationImportDestinationForm = ({
  animationFolderOptions = [],
  imageFolderOptions = [],
  includeImages = false,
  copy = {},
} = {}) => {
  const fields = [
    {
      name: "animationFolderId",
      type: "select",
      label: copy.animationFolderLabel ?? "Animation Folder",
      clearable: false,
      required: true,
      options: animationFolderOptions,
    },
  ];

  if (includeImages) {
    fields.push({
      name: "imageFolderId",
      type: "select",
      label: copy.imageFolderLabel ?? "Image Folder",
      clearable: false,
      required: true,
      options: imageFolderOptions,
    });
  }

  return {
    title: copy.chooseFoldersTitle ?? "Choose Folders",
    fields,
    actions: {
      layout: "",
      buttons: [
        {
          id: "back",
          variant: "se",
          label: copy.backButton ?? "Back",
        },
        {
          id: "import",
          variant: "pr",
          label: copy.importButton ?? "Import Animation",
          validate: true,
        },
      ],
    },
  };
};

const createImportSourceDefaultValues = () => ({
  url: "",
});

const resolveImportFolderValue = (folderId) => {
  return folderId ? folderId : undefined;
};

const createImportDestinationDefaultValues = ({
  animationFolderId,
  imageFolderId,
} = {}) => ({
  animationFolderId: resolveImportFolderValue(animationFolderId),
  imageFolderId: resolveImportFolderValue(imageFolderId),
});

const createImportDestinationFormForState = (state, copy = {}) =>
  createAnimationImportDestinationForm({
    animationFolderOptions: createImportFolderOptions(state.data),
    imageFolderOptions: createImportFolderOptions(state.imagesData),
    includeImages: state.importDialogIncludeImages,
    copy,
  });

const createAnimationExplorerItemContextMenuItems = (copy = {}) => [
  { label: copy.editMenuItem ?? "Edit", type: "item", value: "edit-item" },
  {
    label: copy.renameMenuItem ?? "Rename",
    type: "item",
    value: "rename-item",
  },
  {
    label: copy.duplicateMenuItem ?? "Duplicate",
    type: "item",
    value: "duplicate-item",
  },
  {
    label: copy.deleteMenuItem ?? "Delete",
    type: "item",
    value: "delete-item",
  },
];

const createAnimationCenterItemContextMenuItems = (copy = {}) => [
  { label: copy.editMenuItem ?? "Edit", type: "item", value: "edit-item" },
  {
    label: copy.duplicateMenuItem ?? "Duplicate",
    type: "item",
    value: "duplicate-item",
  },
  {
    label: copy.deleteMenuItem ?? "Delete",
    type: "item",
    value: "delete-item",
  },
];

const buildCatalogItem = (item, { copy = {}, state } = {}) => {
  const displayItem = toAnimationDisplayItem(item);
  return {
    ...displayItem,
    animationTypeLabel: getAnimationTypeLabel(displayItem.animationType, copy),
    timelineDefaultValues: createDefaultInitialValuesByProperty(
      createPropertyFieldConfig(state.projectResolution),
    ),
  };
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
  selectFolderNameDialogItemId,
  setSearchQuery,
  setTagsData,
  setActiveTagIds,
  setDetailTagIds,
  commitDetailTagIds,
  setDetailTagPopoverOpen,
  openCreateTagDialog,
  closeCreateTagDialog,
  selectTagsData,
  selectActiveTagIds,
  selectDetailTagIds,
  selectCreateTagContext,
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
  copy: selectAnimationsPageCopy,
  buildCatalogItem,
  matchesSearch,
  tagging: {
    tagFilterPlaceholder: "Filter tags",
  },
  extendViewData: ({ state, selectedItem, baseViewData, copy }) => {
    const selectedAnimationItem = selectedItem
      ? toAnimationDisplayItem(selectedItem)
      : undefined;

    return {
      ...baseViewData,
      itemContextMenuItems: createAnimationExplorerItemContextMenuItems(copy),
      centerItemContextMenuItems:
        createAnimationCenterItemContextMenuItems(copy),
      isAddDialogOpen: state.isAddDialogOpen,
      isImportDialogOpen: state.isImportDialogOpen,
      importForm:
        state.importDialogStep === IMPORT_DIALOG_DESTINATION_STEP
          ? createImportDestinationFormForState(state, copy)
          : createAnimationImportSourceForm(copy),
      importDialogDefaultValues: state.importDialogDefaultValues,
      importDialogKey: `${state.isImportDialogOpen}-${state.importDialogStep}`,
      addForm: createAddForm(copy),
      addFormDefaults: {
        name: "",
        description: "",
        tagIds: [],
        dialogType: "update",
      },
      isEditDialogOpen: state.isEditDialogOpen,
      editForm: createEditForm(copy),
      editDefaultValues: state.editDefaultValues,
      selectedAnimationTypeLabel: selectedAnimationItem?.animationType
        ? getAnimationTypeLabel(selectedAnimationItem.animationType, copy)
        : "",
      descriptionLabel: copy.descriptionLabel ?? "Description",
      editButton: copy.editMenuItem ?? "Edit",
      importButton: copy.importMenuButton ?? copy.importButton ?? "Import",
      tagsLabel: copy.tagsLabel ?? "Tags",
      typeLabel: copy.typeLabel ?? "Type",
      durationLabel: copy.durationLabel ?? "Duration",
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
  isImportDialogOpen: false,
  importDialogStep: IMPORT_DIALOG_SOURCE_STEP,
  importDialogTargetGroupId: undefined,
  importDialogImageFolderId: undefined,
  importDialogIncludeImages: false,
  importDialogPendingInput: undefined,
  importDialogSourceValues: createImportSourceDefaultValues(),
  importForm: createAnimationImportSourceForm(),
  importDialogDefaultValues: createImportSourceDefaultValues(),
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
  selectFolderNameDialogItemId,
  setTagsData,
  setActiveTagIds,
  setDetailTagIds,
  commitDetailTagIds,
  setDetailTagPopoverOpen,
  openCreateTagDialog,
  closeCreateTagDialog,
  selectTagsData,
  selectActiveTagIds,
  selectDetailTagIds,
  selectCreateTagContext,
  openFolderNameDialog,
  closeFolderNameDialog,
  selectSelectedItemId,
  selectSelectedFolderId,
  setSearchQuery,
};

export const selectAnimationItemById = selectItemById;
export const selectSelectedAnimation = selectSelectedItem;

export const selectEditItemId = ({ state }) => state.editItemId;

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

export const openImportDialog = ({ state }, { targetGroupId } = {}) => {
  state.isImportDialogOpen = true;
  state.importDialogStep = IMPORT_DIALOG_SOURCE_STEP;
  state.importDialogTargetGroupId =
    targetGroupId === IMPORT_FOLDER_ROOT_VALUE ? undefined : targetGroupId;
  state.importDialogImageFolderId = undefined;
  state.importDialogIncludeImages = false;
  state.importDialogPendingInput = undefined;
  state.importDialogSourceValues = createImportSourceDefaultValues();
  state.importDialogDefaultValues = createImportSourceDefaultValues();
  state.importForm = createAnimationImportSourceForm();
};

export const openImportDestinationStep = (
  { state },
  { importInput, sourceValues, includeImages = false } = {},
) => {
  state.importDialogStep = IMPORT_DIALOG_DESTINATION_STEP;
  state.importDialogPendingInput = importInput;
  state.importDialogSourceValues =
    sourceValues ?? createImportSourceDefaultValues();
  state.importDialogIncludeImages = includeImages;
  state.importDialogDefaultValues = createImportDestinationDefaultValues({
    animationFolderId: state.importDialogTargetGroupId,
    imageFolderId: state.importDialogImageFolderId,
  });
  state.importForm = createImportDestinationFormForState(state);
};

export const openImportSourceStep = ({ state }, _payload = {}) => {
  state.importDialogStep = IMPORT_DIALOG_SOURCE_STEP;
  state.importDialogPendingInput = undefined;
  state.importDialogIncludeImages = false;
  state.importDialogDefaultValues = state.importDialogSourceValues;
  state.importForm = createAnimationImportSourceForm();
};

export const closeImportDialog = ({ state }, _payload = {}) => {
  state.isImportDialogOpen = false;
  state.importDialogStep = IMPORT_DIALOG_SOURCE_STEP;
  state.importDialogTargetGroupId = undefined;
  state.importDialogImageFolderId = undefined;
  state.importDialogIncludeImages = false;
  state.importDialogPendingInput = undefined;
  state.importDialogSourceValues = createImportSourceDefaultValues();
  state.importDialogDefaultValues = createImportSourceDefaultValues();
  state.importForm = createAnimationImportSourceForm();
};

export const setImportDestinationValues = ({ state }, { values } = {}) => {
  state.importDialogTargetGroupId = values?.animationFolderId;
  state.importDialogImageFolderId = values?.imageFolderId;
};

export const selectImportDialogTargetGroupId = ({ state }) => {
  return state.importDialogTargetGroupId;
};

export const selectImportDialogImageFolderId = ({ state }) => {
  return state.importDialogImageFolderId;
};

export const selectImportDialogPendingInput = ({ state }) => {
  return state.importDialogPendingInput;
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
