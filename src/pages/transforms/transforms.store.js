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
import { selectTransformsPageCopy } from "./support/transformsPageCopy.js";

const TRANSFORM_TAG_SCOPE_KEY = "transforms";
const TRANSFORM_PREVIEW_IMAGE_SLOT_CONFIGS = Object.freeze([
  {
    labelKey: "backgroundImageLabel",
    target: "preview-background",
  },
  {
    labelKey: "targetImageLabel",
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
  copy,
} = {}) => {
  const resolvedProjectResolution = requireProjectResolution(
    projectResolution,
    copy.projectResolutionLabel,
  );

  return {
    title: editMode ? copy.editTransformTitle : copy.addTransformTitle,
    fields: [
      {
        name: "name",
        type: "input-text",
        label: copy.nameLabel,
        required: true,
      },
      {
        name: "description",
        type: "input-textarea",
        label: copy.descriptionLabel,
        required: false,
      },
      createTagField({
        label: copy.tagsLabel,
        placeholder: copy.selectTagsPlaceholder,
        addOptionLabel: copy.addTagOption,
      }),
      {
        name: "x",
        type: "slider-with-input",
        min: 0,
        max: resolvedProjectResolution.width,
        step: 1,
        label: copy.positionXLabel,
        required: true,
      },
      {
        name: "y",
        type: "slider-with-input",
        min: 0,
        max: resolvedProjectResolution.height,
        step: 1,
        label: copy.positionYLabel,
        required: true,
      },
      {
        name: "scaleX",
        type: "slider-with-input",
        min: 0.1,
        max: 3,
        step: 0.1,
        label: copy.scaleXLabel,
        required: true,
      },
      {
        name: "scaleY",
        type: "slider-with-input",
        min: 0.1,
        max: 3,
        step: 0.1,
        label: copy.scaleYLabel,
        required: true,
      },
      {
        name: "anchor",
        type: "select",
        label: copy.anchorLabel,
        placeholder: copy.chooseAnchorPlaceholder,
        options: [
          {
            id: "tl",
            label: copy.anchorTopLeft,
            value: { anchorX: 0, anchorY: 0 },
          },
          {
            id: "tc",
            label: copy.anchorTopCenter,
            value: { anchorX: 0.5, anchorY: 0 },
          },
          {
            id: "tr",
            label: copy.anchorTopRight,
            value: { anchorX: 1, anchorY: 0 },
          },
          {
            id: "cl",
            label: copy.anchorCenterLeft,
            value: { anchorX: 0, anchorY: 0.5 },
          },
          {
            id: "cc",
            label: copy.anchorCenterCenter,
            value: { anchorX: 0.5, anchorY: 0.5 },
          },
          {
            id: "cr",
            label: copy.anchorCenterRight,
            value: { anchorX: 1, anchorY: 0.5 },
          },
          {
            id: "bl",
            label: copy.anchorBottomLeft,
            value: { anchorX: 0, anchorY: 1 },
          },
          {
            id: "bc",
            label: copy.anchorBottomCenter,
            value: { anchorX: 0.5, anchorY: 1 },
          },
          {
            id: "br",
            label: copy.anchorBottomRight,
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
          label: editMode
            ? copy.updateTransformButton
            : copy.addTransformButton,
        },
      ],
    },
  };
};

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

const createTransformImportSourceForm = (copy) => ({
  title: copy.importTransformTitle,
  fields: [
    {
      name: "url",
      type: "input-text",
      label: copy.urlLabel,
      required: {
        message: copy.importUrlRequired,
      },
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "continue",
        variant: "pr",
        label: copy.continueButton,
        validate: true,
      },
    ],
  },
});

const createTransformImportDestinationForm = ({
  transformFolderOptions = [],
  imageFolderOptions = [],
  includeImages = false,
  copy,
} = {}) => {
  const fields = [
    {
      name: "transformFolderId",
      type: "select",
      label: copy.transformFolderLabel,
      clearable: false,
      required: true,
      options: transformFolderOptions,
    },
  ];

  if (includeImages) {
    fields.push({
      name: "imageFolderId",
      type: "select",
      label: copy.imageFolderLabel,
      clearable: false,
      required: true,
      options: imageFolderOptions,
    });
  }

  return {
    title: copy.chooseFoldersTitle,
    fields,
    actions: {
      layout: "",
      buttons: [
        {
          id: "back",
          variant: "se",
          label: copy.backButton,
        },
        {
          id: "import",
          variant: "pr",
          label: copy.importTransformButton,
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
  return typeof folderId === "string" && folderId.length > 0
    ? folderId
    : undefined;
};

const createImportDestinationDefaultValues = ({
  transformFolderId,
  imageFolderId,
} = {}) => ({
  transformFolderId: resolveImportFolderValue(transformFolderId),
  imageFolderId: resolveImportFolderValue(imageFolderId),
});

const createImportDestinationFormForState = (state, copy) =>
  createTransformImportDestinationForm({
    transformFolderOptions: createImportFolderOptions(state.data),
    imageFolderOptions: createImportFolderOptions(state.imagesData),
    includeImages: state.importDialogIncludeImages,
    copy,
  });

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

const createPreviewImageMenu = () => ({
  isOpen: false,
  x: 0,
  y: 0,
  target: undefined,
  items: [],
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

const buildPreviewPanel = (state, copy) => ({
  items: TRANSFORM_PREVIEW_IMAGE_SLOT_CONFIGS.map((slot) => ({
    label: copy[slot.labelKey],
    target: slot.target,
    image: buildPreviewImageCard(
      state,
      selectPreviewImageIdFromState(state, slot.target),
    ),
  })),
});

const buildDetailFields = (item, { copy } = {}) => {
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
      label: copy.tagsLabel,
    },
    {
      type: "text",
      label: copy.positionXLabel,
      value: String(item.x ?? 0),
    },
    {
      type: "text",
      label: copy.positionYLabel,
      value: String(item.y ?? 0),
    },
    {
      type: "text",
      label: copy.scaleXLabel,
      value: String(item.scaleX ?? 1),
    },
    {
      type: "text",
      label: copy.scaleYLabel,
      value: String(item.scaleY ?? 1),
    },
    {
      type: "text",
      label: copy.anchorXLabel,
      value: String(item.anchorX ?? 0),
    },
    {
      type: "text",
      label: copy.anchorYLabel,
      value: String(item.anchorY ?? 0),
    },
  ];
};

const buildCatalogItem = (item) => ({
  ...item,
  cardKind: "transform",
});

const matchesSearch = matchesTagAwareSearch;

const createTransformCenterItemContextMenuItems = (copy) => [
  { label: copy.editMenuItem, type: "item", value: "edit-item" },
  { label: copy.duplicateMenuItem, type: "item", value: "duplicate-item" },
  { label: copy.deleteMenuItem, type: "item", value: "delete-item" },
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
  title: "",
  selectedResourceId: "transforms",
  resourceCategory: "assets",
  addText: "",
  centerItemContextMenuItems: [],
  emptyMessage: "",
  matchesSearch,
  buildDetailFields,
  buildCatalogItem,
  copy: selectTransformsPageCopy,
  hiddenMobileDetailSlots: ["transform-preview"],
  tagging: {
    tagFilterPlaceholder: "",
  },
  extendViewData: ({ state, selectedItem, baseViewData, copy }) => {
    return {
      ...baseViewData,
      centerItemContextMenuItems:
        createTransformCenterItemContextMenuItems(copy),
      isDialogOpen: state.isDialogOpen,
      isImportDialogOpen: state.isImportDialogOpen,
      importForm:
        state.importDialogStep === IMPORT_DIALOG_DESTINATION_STEP
          ? createImportDestinationFormForState(state, copy)
          : createTransformImportSourceForm(copy),
      importDialogDefaultValues: state.importDialogDefaultValues,
      importDialogKey: `${state.isImportDialogOpen}-${state.importDialogStep}`,
      isPreviewOnlyDialog: state.dialogMode === "preview",
      transformForm: createTransformForm({
        editMode: state.editMode,
        projectResolution: state.projectResolution,
        copy,
      }),
      dialogDefaultValues: state.dialogDefaultValues,
      dialogPreviewItem: state.dialogItemData,
      dialogPreviewThumbnailFileId: state.dialogItemData?.thumbnailFileId,
      dialogPreviewFileId:
        state.dialogItemData?.previewFileId ??
        state.dialogItemData?.thumbnailFileId,
      previewPanel: buildPreviewPanel(state, copy),
      cancelButton: copy.cancelButton,
      confirmButton: copy.confirmButton,
      noPreviewLabel: copy.noPreviewLabel,
      noPreviewImageLabel: copy.noPreviewImageLabel,
      previewLabel: copy.previewLabel,
      editButton: copy.editMenuItem ?? "Edit",
      selectImageLabel: copy.selectImageLabel,
      updateToSetPreviewLabel: copy.updateToSetPreviewLabel,
      imageSelectorDialog: {
        ...state.imageSelectorDialog,
        title:
          state.imageSelectorDialog.target === "preview-background"
            ? copy.selectBackgroundTitle
            : copy.selectTargetImageTitle,
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
  isImportDialogOpen: false,
  importDialogStep: IMPORT_DIALOG_SOURCE_STEP,
  importDialogTargetGroupId: undefined,
  importDialogImageFolderId: undefined,
  importDialogIncludeImages: false,
  importDialogPendingInput: undefined,
  importDialogSourceValues: createImportSourceDefaultValues(),
  importDialogDefaultValues: createImportSourceDefaultValues(),
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
  previewImageMenu: createPreviewImageMenu(),
  fullImagePreviewVisible: false,
  fullImagePreviewImageId: undefined,
  fullImagePreviewFileId: undefined,
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
  state.previewImageMenu = createPreviewImageMenu();
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewImageId = undefined;
  state.fullImagePreviewFileId = undefined;
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
  state.previewImageMenu = createPreviewImageMenu();
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewImageId = undefined;
  state.fullImagePreviewFileId = undefined;
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
    transformFolderId: state.importDialogTargetGroupId,
    imageFolderId: state.importDialogImageFolderId,
  });
};

export const openImportSourceStep = ({ state }, _payload = {}) => {
  state.importDialogStep = IMPORT_DIALOG_SOURCE_STEP;
  state.importDialogPendingInput = undefined;
  state.importDialogIncludeImages = false;
  state.importDialogDefaultValues = state.importDialogSourceValues;
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
};

export const setImportDestinationValues = ({ state }, { values } = {}) => {
  state.importDialogTargetGroupId = values?.transformFolderId;
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

export const selectPreviewImageMenuTarget = ({ state }) => {
  return state.previewImageMenu.target;
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

export const openPreviewImageMenu = (
  { state },
  { target, x, y, items } = {},
) => {
  const slotConfig = getPreviewSlotConfig(target);
  const imageId = selectPreviewImageIdFromState(state, target);
  state.previewImageMenu = createPreviewImageMenu();

  if (!slotConfig || !imageId) {
    return;
  }

  state.previewImageMenu.isOpen = true;
  state.previewImageMenu.x = x;
  state.previewImageMenu.y = y;
  state.previewImageMenu.target = target;
  state.previewImageMenu.items = items ?? [];
};

export const closePreviewImageMenu = ({ state }, _payload = {}) => {
  state.previewImageMenu = createPreviewImageMenu();
};

export const clearPreviewImage = ({ state }, { target } = {}) => {
  const slotConfig = getPreviewSlotConfig(target);
  if (!slotConfig) {
    return;
  }

  setPreviewImageIdInState(state, target, undefined);
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
    previewImageMenu: context.state.previewImageMenu,
  };
};

export { TRANSFORM_TAG_SCOPE_KEY };
