import { createCatalogPageStore } from "../../internal/ui/resourcePages/catalog/createCatalogPageStore.js";
import { createTagField } from "../../internal/ui/resourcePages/tags.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import {
  DEFAULT_PROJECT_RESOLUTION,
  formatProjectResolutionAspectRatio,
  requireProjectResolution,
} from "../../internal/projectResolution.js";
import { matchesTagAwareSearch } from "../../internal/resourceTags.js";
import { toFlatItems } from "../../internal/project/tree.js";

const TRANSFORM_TAG_SCOPE_KEY = "transforms";
const TRANSFORM_PREVIEW_IMAGE_SLOT_CONFIGS = Object.freeze([
  {
    label: "BG Image",
    target: "preview-background",
  },
  {
    label: "Target Image",
    target: "preview-target",
  },
]);

const createEmptyImageCollection = () => ({
  items: {},
  tree: [],
});

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
        name: "description",
        type: "input-textarea",
        label: "Description",
        required: false,
      },
      createTagField(),
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
  description: item?.description ?? "",
  tagIds: item?.tagIds ?? [],
  x: String(item?.x ?? 0),
  y: String(item?.y ?? 0),
  scaleX: String(item?.scaleX ?? 1),
  scaleY: String(item?.scaleY ?? 1),
  anchor: {
    anchorX: item?.anchorX ?? 0,
    anchorY: item?.anchorY ?? 0,
  },
});

const createPreviewImageSelectorDialog = () => ({
  open: false,
  target: undefined,
  selectedImageId: undefined,
  originalImageId: undefined,
});

const resolvePreviewImageId = (preview, slotKey) => {
  const imageId = preview?.[slotKey]?.imageId;
  return typeof imageId === "string" && imageId.length > 0
    ? imageId
    : undefined;
};

const getPreviewSlotConfig = (target) => {
  return TRANSFORM_PREVIEW_IMAGE_SLOT_CONFIGS.find(
    (slot) => slot.target === target,
  );
};

const getImageItemById = (imagesData, imageId) => {
  if (!imageId) {
    return undefined;
  }

  const item = imagesData?.items?.[imageId];
  return item?.type === "image" ? item : undefined;
};

const buildPreviewImageCard = (state, imageId) => {
  const item = getImageItemById(state.imagesData, imageId);
  if (!item) {
    return undefined;
  }

  return {
    id: item.id,
    name: item.name,
    fileId: item.fileId,
    thumbnailFileId: item.thumbnailFileId,
    previewFileId: item.thumbnailFileId ?? item.fileId,
    previewAspectRatio: "16 / 9",
    itemBorderColor: "bo",
    itemHoverBorderColor: "ac",
  };
};

const selectPreviewImageIdFromState = (state, target) => {
  if (target === "preview-background") {
    return state.dialogPreviewBackgroundImageId;
  }

  if (target === "preview-target") {
    return state.dialogPreviewTargetImageId;
  }

  return undefined;
};

const setPreviewImageIdInState = (state, target, imageId) => {
  if (target === "preview-background") {
    state.dialogPreviewBackgroundImageId = imageId;
    return;
  }

  if (target === "preview-target") {
    state.dialogPreviewTargetImageId = imageId;
  }
};

const buildPreviewPanel = (state) => ({
  items: TRANSFORM_PREVIEW_IMAGE_SLOT_CONFIGS.map((slot) => ({
    label: slot.label,
    target: slot.target,
    image: buildPreviewImageCard(
      state,
      selectPreviewImageIdFromState(state, slot.target),
    ),
  })),
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
      type: "description",
      value: item.description ?? "",
    },
    {
      type: "slot",
      slot: "transform-tags",
      label: "Tags",
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

const matchesSearch = matchesTagAwareSearch;

const transformCenterItemContextMenuItems = [
  { label: "Edit", type: "item", value: "edit-item" },
  { label: "Duplicate", type: "item", value: "duplicate-item" },
  { label: "Delete", type: "item", value: "delete-item" },
];

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
  itemType: "transform",
  resourceType: "transforms",
  title: "Transforms",
  selectedResourceId: "transforms",
  resourceCategory: "assets",
  addText: "Add",
  centerItemContextMenuItems: transformCenterItemContextMenuItems,
  emptyMessage: "No transforms found",
  matchesSearch,
  buildDetailFields,
  buildCatalogItem,
  hiddenMobileDetailSlots: ["transform-preview"],
  tagging: {
    tagFilterPlaceholder: "Filter tags",
  },
  extendViewData: ({ state, selectedItem, baseViewData }) => {
    return {
      ...baseViewData,
      isDialogOpen: state.isDialogOpen,
      isPreviewOnlyDialog: state.dialogMode === "preview",
      transformForm: state.transformForm,
      dialogDefaultValues: state.dialogDefaultValues,
      dialogPreviewItem: state.dialogItemData,
      dialogPreviewThumbnailFileId: state.dialogItemData?.thumbnailFileId,
      dialogPreviewFileId:
        state.dialogItemData?.previewFileId ??
        state.dialogItemData?.thumbnailFileId,
      previewPanel: buildPreviewPanel(state),
      imageSelectorDialog: {
        ...state.imageSelectorDialog,
        title:
          state.imageSelectorDialog.target === "preview-background"
            ? "Select Background"
            : "Select Target Image",
      },
      canvasAspectRatio: formatProjectResolutionAspectRatio(
        state.projectResolution,
      ),
      projectResolution: state.projectResolution,
      selectedItem,
    };
  },
});

export const createInitialState = () => ({
  ...createCatalogInitialState(),
  isDialogOpen: false,
  dialogMode: "form",
  targetGroupId: undefined,
  editMode: false,
  editItemId: undefined,
  dialogItemData: undefined,
  projectResolution: DEFAULT_PROJECT_RESOLUTION,
  imagesData: createEmptyImageCollection(),
  dialogDefaultValues: createDialogDefaultValues(),
  dialogValues: createDialogDefaultValues(),
  dialogPreviewBackgroundImageId: undefined,
  dialogPreviewTargetImageId: undefined,
  imageSelectorDialog: createPreviewImageSelectorDialog(),
  fullImagePreviewVisible: false,
  fullImagePreviewImageId: undefined,
  fullImagePreviewFileId: undefined,
  transformForm: createTransformForm(),
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

export const selectTransformItemById = selectItemById;

export const setImagesData = ({ state }, { imagesData } = {}) => {
  state.imagesData = imagesData ?? createEmptyImageCollection();

  if (
    state.dialogPreviewBackgroundImageId &&
    !getImageItemById(state.imagesData, state.dialogPreviewBackgroundImageId)
  ) {
    state.dialogPreviewBackgroundImageId = undefined;
  }

  if (
    state.dialogPreviewTargetImageId &&
    !getImageItemById(state.imagesData, state.dialogPreviewTargetImageId)
  ) {
    state.dialogPreviewTargetImageId = undefined;
  }
};

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

const setDialogState = (state, options = {}) => {
  const {
    dialogMode = "form",
    editMode = false,
    itemId = undefined,
    itemData = undefined,
    targetGroupId = undefined,
  } = options;

  state.isDialogOpen = true;
  state.dialogMode = dialogMode;
  state.editMode = editMode;
  state.editItemId = itemId;
  state.dialogItemData = itemData;
  state.targetGroupId = targetGroupId === "_root" ? undefined : targetGroupId;
  state.dialogDefaultValues = createDialogDefaultValues(itemData);
  state.dialogValues = createDialogDefaultValues(itemData);
  state.dialogPreviewBackgroundImageId = resolvePreviewImageId(
    itemData?.preview,
    "background",
  );
  state.dialogPreviewTargetImageId = resolvePreviewImageId(
    itemData?.preview,
    "target",
  );
  state.imageSelectorDialog = createPreviewImageSelectorDialog();
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewImageId = undefined;
  state.fullImagePreviewFileId = undefined;
  state.transformForm = createTransformForm({
    editMode,
    projectResolution: state.projectResolution,
  });
};

export const openTransformFormDialog = ({ state }, options = {}) => {
  setDialogState(state, {
    ...options,
    dialogMode: "form",
  });
};

export const openTransformPreviewDialog = ({ state }, options = {}) => {
  setDialogState(state, {
    ...options,
    dialogMode: "preview",
    editMode: false,
    targetGroupId: undefined,
  });
};

export const closeTransformFormDialog = ({ state }, _payload = {}) => {
  state.isDialogOpen = false;
  state.dialogMode = "form";
  state.targetGroupId = undefined;
  state.editMode = false;
  state.editItemId = undefined;
  state.dialogItemData = undefined;
  state.dialogDefaultValues = createDialogDefaultValues();
  state.dialogValues = createDialogDefaultValues();
  state.dialogPreviewBackgroundImageId = undefined;
  state.dialogPreviewTargetImageId = undefined;
  state.imageSelectorDialog = createPreviewImageSelectorDialog();
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewImageId = undefined;
  state.fullImagePreviewFileId = undefined;
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

export const setDialogValues = ({ state }, { values } = {}) => {
  state.dialogValues = values ?? createDialogDefaultValues();
};

export const selectDialogValues = ({ state }) => {
  return state.dialogValues;
};

export const selectDialogPreviewBackgroundImage = ({ state }) => {
  return getImageItemById(
    state.imagesData,
    state.dialogPreviewBackgroundImageId,
  );
};

export const selectDialogPreviewTargetImage = ({ state }) => {
  return getImageItemById(state.imagesData, state.dialogPreviewTargetImageId);
};

export const selectDialogPreviewData = ({ state }) => {
  const preview = {};

  if (state.dialogPreviewBackgroundImageId) {
    preview.background = {
      imageId: state.dialogPreviewBackgroundImageId,
    };
  }

  if (state.dialogPreviewTargetImageId) {
    preview.target = {
      imageId: state.dialogPreviewTargetImageId,
    };
  }

  return Object.keys(preview).length > 0 ? preview : undefined;
};

export const openPreviewImageSelectorDialog = ({ state }, { target } = {}) => {
  const slotConfig = getPreviewSlotConfig(target);
  if (!slotConfig) {
    return;
  }

  state.imageSelectorDialog.open = true;
  state.imageSelectorDialog.target = target;
  const imageId = selectPreviewImageIdFromState(state, target);
  state.imageSelectorDialog.selectedImageId = imageId;
  state.imageSelectorDialog.originalImageId = imageId;
};

export const closePreviewImageSelectorDialog = ({ state }, _payload = {}) => {
  setPreviewImageIdInState(
    state,
    state.imageSelectorDialog.target,
    state.imageSelectorDialog.originalImageId,
  );
  state.imageSelectorDialog = createPreviewImageSelectorDialog();
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewImageId = undefined;
  state.fullImagePreviewFileId = undefined;
};

export const applyPreviewImageSelectorSelection = (
  { state },
  { imageId } = {},
) => {
  state.imageSelectorDialog.selectedImageId = imageId;
  setPreviewImageIdInState(state, state.imageSelectorDialog.target, imageId);
};

export const commitPreviewImageSelectorSelection = (
  { state },
  _payload = {},
) => {
  const imageId = state.imageSelectorDialog.selectedImageId;
  setPreviewImageIdInState(state, state.imageSelectorDialog.target, imageId);
  state.imageSelectorDialog = createPreviewImageSelectorDialog();
};

export const showFullImagePreview = ({ state }, { imageId } = {}) => {
  const imageItem = getImageItemById(state.imagesData, imageId);
  state.fullImagePreviewVisible = true;
  state.fullImagePreviewImageId = imageId;
  state.fullImagePreviewFileId =
    imageItem?.thumbnailFileId ?? imageItem?.fileId ?? undefined;
};

export const hideFullImagePreview = ({ state }, _payload = {}) => {
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewImageId = undefined;
  state.fullImagePreviewFileId = undefined;
};

export const selectImageSelectorFileExplorerItems = ({ state }) => {
  return toFlatItems(state.imagesData).filter((item) => item.type === "folder");
};

export const selectViewData = (context) => {
  const viewData = selectCatalogViewData(context);

  return {
    ...viewData,
    flatItems: applyFolderRequiredRootDragOptions(viewData.flatItems),
    imageFolderItems: selectImageSelectorFileExplorerItems(context),
    fullImagePreviewVisible: context.state.fullImagePreviewVisible,
    fullImagePreviewImageId: context.state.fullImagePreviewImageId,
    fullImagePreviewFileId: context.state.fullImagePreviewFileId,
  };
};

export { TRANSFORM_TAG_SCOPE_KEY };
