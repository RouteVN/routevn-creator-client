import { formatFileSize } from "../../internal/files.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";
import {
  createEmptyTagCollection,
  matchesTagAwareSearch,
  matchesTagFilter,
} from "../../internal/resourceTags.js";
import {
  DEFAULT_PROJECT_RESOLUTION,
  formatProjectResolutionAspectRatio,
  requireProjectResolution,
} from "../../internal/projectResolution.js";
import {
  INITIAL_SPRITESHEET_CLIP_FPS,
  formatSpritesheetFps,
  normalizeSpritesheetAnimationsFps,
  normalizeSpritesheetFps,
  resolveSpritesheetAnimationFps,
} from "../../internal/spritesheets.js";
import {
  DEFAULT_FILE_EXPLORER_AUTO_COLLAPSE_THRESHOLD,
  shouldStartCollapsedFileExplorer,
} from "../../internal/ui/resourcePages/media/mediaPageShared.js";
import {
  buildMobileResourcePageViewData,
  closeMobileResourceFileExplorerState,
  createMobileResourcePageState,
  openMobileResourceFileExplorerState,
  setMobileResourcePageUiConfigState,
} from "../../internal/ui/resourcePages/mobileResourcePage.js";
import {
  buildTagViewData,
  closeCreateTagDialogState,
  commitDetailTagIdsState,
  createTagField,
  createTagForm,
  createTagState,
  openCreateTagDialogState,
  setActiveTagIdsState,
  setDetailTagIdsState,
  setDetailTagPopoverOpenState,
  setTagsDataState,
  syncDetailTagIds,
} from "../../internal/ui/resourcePages/tags.js";

const EMPTY_TREE = { tree: [], items: {} };
const AUTO_COLLAPSE_FILE_EXPLORER_ITEM_THRESHOLD =
  DEFAULT_FILE_EXPLORER_AUTO_COLLAPSE_THRESHOLD;
const IMAGE_CARD_MAX_WIDTH = 400;
const IMAGE_CARD_HEIGHT = 225;
const FULL_IMAGE_PREVIEW_DISPLAY_MODE_FIT = "fit";
const FULL_IMAGE_PREVIEW_DISPLAY_MODE_CANVAS = "canvas";
const CREATE_TAG_DEFAULT_VALUES = Object.freeze({
  name: "",
});

const createPreviewFrameStyle = (projectResolution) => {
  const aspectRatio = formatProjectResolutionAspectRatio(projectResolution);

  return [
    `width: min(92vw, calc(92vh * (${aspectRatio})))`,
    `aspect-ratio: ${aspectRatio}`,
    "max-width: 92vw",
    "max-height: 92vh",
  ].join("; ");
};

const resolvePositiveNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0
    ? numericValue
    : undefined;
};

const createPreviewImageWrapperStyle = ({
  image,
  displayMode,
  projectResolution,
} = {}) => {
  if (displayMode !== FULL_IMAGE_PREVIEW_DISPLAY_MODE_CANVAS) {
    return "position: absolute; inset: 0;";
  }

  const imageWidth = resolvePositiveNumber(image?.width);
  const imageHeight = resolvePositiveNumber(image?.height);
  if (!imageWidth || !imageHeight) {
    return "position: absolute; inset: 0;";
  }

  const widthPercent = (imageWidth / projectResolution.width) * 100;
  const heightPercent = (imageHeight / projectResolution.height) * 100;

  return [
    "position: absolute",
    "left: 50%",
    "top: 50%",
    `width: ${widthPercent}%`,
    `height: ${heightPercent}%`,
    "transform: translate(-50%, -50%)",
  ].join("; ");
};

const createPreviewModeButtonViewData = ({ displayMode, mode } = {}) => {
  const selected = displayMode === mode;

  return {
    backgroundColor: selected ? "ac" : "bg",
    borderColor: selected ? "ac" : "bo",
    iconColor: selected ? "white" : "mu-fg",
    selected,
  };
};

const folderContextMenuItems = [
  { label: "New Folder", type: "item", value: "new-child-folder" },
  { label: "Rename", type: "item", value: "rename-item" },
  { label: "Delete", type: "item", value: "delete-item" },
];

const itemContextMenuItems = [
  { label: "Rename", type: "item", value: "rename-item" },
  { label: "Delete", type: "item", value: "delete-item" },
];

const emptyContextMenuItems = [
  { label: "New Folder", type: "item", value: "new-item" },
];

const centerItemContextMenuItems = [
  { label: "Edit", type: "item", value: "edit-item" },
  { label: "Preview", type: "item", value: "preview-item" },
  { label: "Delete", type: "item", value: "delete-item" },
];

const resolveSheetWidth = (item) =>
  item?.sheetWidth ?? item?.jsonData?.meta?.size?.w ?? "";

const resolveSheetHeight = (item) =>
  item?.sheetHeight ?? item?.jsonData?.meta?.size?.h ?? "";

const resolveFrameCount = (item) =>
  item?.frameCount ?? Object.keys(item?.jsonData?.frames ?? {}).length ?? 0;

const buildImageDetailFields = (item) => {
  if (!item) {
    return [];
  }

  return [
    {
      type: "slot",
      slot: "image-file-id",
      label: "",
    },
    {
      type: "description",
      value: item.description ?? "",
    },
    {
      type: "slot",
      slot: "sprite-tags",
      label: "Tags",
    },
    {
      type: "text",
      label: "File Type",
      value: item.fileType ?? "",
    },
    {
      type: "text",
      label: "File Size",
      value: formatFileSize(item.fileSize),
    },
    {
      type: "text",
      label: "Dimensions",
      value: item.width && item.height ? `${item.width} × ${item.height}` : "",
    },
  ];
};

const buildSpritesheetDetailFields = (item) => {
  if (!item) {
    return [];
  }

  const animationCount = Object.keys(item.animations ?? {}).length;

  return [
    {
      type: "slot",
      slot: "spritesheet-preview",
      label: "",
    },
    {
      type: "description",
      value: item.description ?? "",
    },
    {
      type: "slot",
      slot: "sprite-tags",
      label: "Tags",
    },
    {
      type: "text",
      label: "File Type",
      value: item.fileType ?? "",
    },
    {
      type: "text",
      label: "File Size",
      value: formatFileSize(item.fileSize),
    },
    {
      type: "text",
      label: "Default Size",
      value: item.width && item.height ? `${item.width} × ${item.height}` : "",
    },
    {
      type: "text",
      label: "Sheet Size",
      value:
        resolveSheetWidth(item) && resolveSheetHeight(item)
          ? `${resolveSheetWidth(item)} × ${resolveSheetHeight(item)}`
          : "",
    },
    {
      type: "text",
      label: "Frames",
      value: String(resolveFrameCount(item) || ""),
    },
    {
      type: "text",
      label: "Animations",
      value: String(animationCount || ""),
    },
    {
      type: "slot",
      slot: "spritesheet-animations",
      label: "",
    },
  ];
};

const buildFolderDetailFields = (folder) => {
  if (!folder) {
    return [];
  }

  return [
    {
      type: "text",
      label: "Type",
      value: "folder",
    },
    {
      type: "description",
      value: folder.description ?? "",
    },
  ];
};

const getPreviewFileId = (item) => item?.thumbnailFileId ?? item?.fileId;

const createEditForm = ({ tagOptions } = {}) => ({
  title: "Edit Sprite",
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
    createTagField({
      options: tagOptions ?? [],
    }),
    {
      type: "slot",
      slot: "image-slot",
      label: "Image",
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: "Update Sprite",
      },
    ],
  },
});

const spritesheetDialogForm = {
  title: "Spritesheet",
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
    {
      type: "slot",
      slot: "spritesheet-image-source",
      label: "Image",
    },
    {
      type: "slot",
      slot: "spritesheet-atlas-source",
      label: "Spritesheet JSON",
    },
    {
      name: "tagIds",
      type: "tag-select",
      label: "Tags",
      placeholder: "Select tags",
      addOption: {
        label: "Add tag",
      },
      required: false,
    },
    {
      name: "width",
      type: "input-number",
      label: "Default Width",
      required: false,
    },
    {
      name: "height",
      type: "input-number",
      label: "Default Height",
      required: false,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: "Save",
      },
    ],
  },
};

const buildSpritesheetDialogForm = (submitLabel) => ({
  ...spritesheetDialogForm,
  actions: {
    ...spritesheetDialogForm.actions,
    buttons: spritesheetDialogForm.actions.buttons.map((button) => ({
      ...button,
      label: button.id === "submit" ? submitLabel : button.label,
    })),
  },
});

const folderNameForm = {
  title: "Edit Folder",
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
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: "Save",
        validate: true,
      },
    ],
  },
};

const clipFpsForm = {
  title: "Clip FPS",
  fields: [
    {
      name: "fps",
      type: "input-number",
      label: "FPS",
      min: 0.1,
      step: 1,
      required: true,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: "Update FPS",
      },
    ],
  },
};

const buildClipFpsForm = (clipName) => ({
  ...clipFpsForm,
  title:
    typeof clipName === "string" && clipName.length > 0
      ? `Clip FPS: ${clipName}`
      : clipFpsForm.title,
});

const matchesSearch = (item, searchQuery) => {
  if (!searchQuery) {
    return true;
  }

  return matchesTagAwareSearch(item, searchQuery);
};

const buildMediaItem = (item) => ({
  ...item,
  cardKind: "image",
  previewFileId: getPreviewFileId(item),
  canPreview: false,
});

const buildPendingMediaItem = (item) => ({
  id: item.id,
  name: item.name,
  cardKind: "image",
  isProcessing: true,
  isInteractive: false,
  canPreview: false,
});

const cloneSpritesheetDialogAnimations = (
  animations = {},
  missingClipFps = INITIAL_SPRITESHEET_CLIP_FPS,
) => normalizeSpritesheetAnimationsFps(animations, missingClipFps);

const buildClipOptions = (
  animations = {},
  selectedClipName,
  missingClipFps = INITIAL_SPRITESHEET_CLIP_FPS,
) => {
  const clipOptions = Object.entries(animations ?? {}).map(
    ([name, animation]) => {
      const fps = resolveSpritesheetAnimationFps(animation, missingClipFps);

      return {
        name,
        frameCount: animation?.frames?.length ?? 0,
        fps,
        fpsLabel: formatSpritesheetFps(fps),
        loop: animation?.loop ?? true,
        isSelected: name === selectedClipName,
      };
    },
  );

  const fallbackSelectedClipName =
    clipOptions.find((clip) => clip.isSelected)?.name ?? clipOptions[0]?.name;

  return {
    selectedClipName: fallbackSelectedClipName,
    clipOptions: clipOptions.map((clip) => ({
      ...clip,
      isSelected: clip.name === fallbackSelectedClipName,
      loopLabel: clip.loop ? "Loop" : "Once",
      borderColor: clip.name === fallbackSelectedClipName ? "ac" : "bo",
      backgroundColor: clip.name === fallbackSelectedClipName ? "mu" : "bg",
    })),
  };
};

const buildSpritesheetDialogValues = (item) => ({
  name: item?.name ?? "",
  description: item?.description ?? "",
  tagIds: item?.tagIds ?? [],
  width: item?.width ?? "",
  height: item?.height ?? "",
});

const createSpritesheetDialogSourceFiles = () => ({
  pngFile: undefined,
  atlasFile: undefined,
});

const createClipFpsDialogValues = (fps = INITIAL_SPRITESHEET_CLIP_FPS) => ({
  fps,
});

const selectVisibleSpriteIds = ({ mediaGroups, items } = {}) => {
  return (mediaGroups ?? []).flatMap((group) =>
    (group.children ?? [])
      .map((child) => child.id)
      .filter((childItemId) => items?.[childItemId]?.type === "image"),
  );
};

const resolveAdjacentSpriteItemId = ({
  visibleSpriteIds,
  itemId,
  direction,
  distance = 1,
  clamp = false,
} = {}) => {
  const step =
    direction === "next" ? 1 : direction === "previous" ? -1 : undefined;
  if (!step) {
    return undefined;
  }

  const numericDistance = Number(distance);
  const itemDistance =
    Number.isFinite(numericDistance) && numericDistance > 0
      ? Math.floor(numericDistance)
      : 1;
  const spriteIds = visibleSpriteIds ?? [];

  if (spriteIds.length === 0) {
    return undefined;
  }

  const currentIndex = spriteIds.indexOf(itemId);
  if (currentIndex === -1) {
    return step > 0 ? spriteIds[0] : spriteIds[spriteIds.length - 1];
  }

  let nextIndex = currentIndex + step * itemDistance;
  if (clamp) {
    nextIndex = Math.max(0, Math.min(nextIndex, spriteIds.length - 1));
  }

  return spriteIds[nextIndex];
};

export const createInitialState = () => ({
  spritesData: EMPTY_TREE,
  ...createTagState(),
  pendingUploads: [],
  selectedItemId: undefined,
  selectedFolderId: undefined,
  characterId: undefined,
  characterName: undefined,
  searchQuery: "",
  ...createMobileResourcePageState(),
  fullImagePreviewVisible: false,
  fullImagePreviewFileId: undefined,
  fullImagePreviewDisplayMode: FULL_IMAGE_PREVIEW_DISPLAY_MODE_CANVAS,
  projectResolution: DEFAULT_PROJECT_RESOLUTION,
  isEditDialogOpen: false,
  editItemId: undefined,
  editDefaultValues: {
    name: "",
    description: "",
    tagIds: [],
  },
  editPreviewFileId: undefined,
  editUploadResult: undefined,
  detailSelectedClipName: undefined,
  isSpritesheetDialogOpen: false,
  spritesheetDialogMode: "create",
  spritesheetDialogItemId: undefined,
  spritesheetDialogParentId: undefined,
  spritesheetDialogValues: buildSpritesheetDialogValues(),
  spritesheetDialogPreviewUrl: undefined,
  spritesheetDialogImportData: undefined,
  spritesheetDialogDraftAnimations: {},
  spritesheetDialogSourceFiles: createSpritesheetDialogSourceFiles(),
  spritesheetDialogSelectedClipName: undefined,
  spritesheetDialogRevision: 0,
  isClipFpsDialogOpen: false,
  clipFpsDialogClipName: undefined,
  clipFpsDialogValues: createClipFpsDialogValues(),
  clipFpsDialogRevision: 0,
  isFolderNameDialogOpen: false,
  folderNameDialogItemId: undefined,
  folderNameDialogDefaultValues: {
    name: "",
    description: "",
  },
});

const closeClipFpsDialogState = (state) => {
  state.isClipFpsDialogOpen = false;
  state.clipFpsDialogClipName = undefined;
  state.clipFpsDialogValues = createClipFpsDialogValues();
  state.clipFpsDialogRevision += 1;
};

export const setItems = ({ state }, { spritesData } = {}) => {
  state.spritesData = spritesData ?? EMPTY_TREE;
  if (
    state.selectedFolderId &&
    state.spritesData.items?.[state.selectedFolderId]?.type !== "folder"
  ) {
    state.selectedFolderId = undefined;
  }
  syncDetailTagIds({
    state,
    item: state.spritesData.items?.[state.selectedItemId],
    preserveDirty: true,
  });
};

export const setTagsData = ({ state }, { tagsData } = {}) => {
  setTagsDataState({
    state,
    tagsData,
  });
};

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  setMobileResourcePageUiConfigState(state, {
    uiConfig,
  });
};

export const openMobileFileExplorer = ({ state }, _payload = {}) => {
  openMobileResourceFileExplorerState(state);
};

export const closeMobileFileExplorer = ({ state }, _payload = {}) => {
  closeMobileResourceFileExplorerState(state);
};

export const addPendingUploads = ({ state }, { items } = {}) => {
  if (!Array.isArray(items) || items.length === 0) {
    return;
  }

  state.pendingUploads.push(...items);
};

export const removePendingUploads = ({ state }, { itemIds } = {}) => {
  const idSet = new Set(Array.isArray(itemIds) ? itemIds : []);
  if (idSet.size === 0) {
    return;
  }

  state.pendingUploads = state.pendingUploads.filter(
    (item) => !idSet.has(item.id),
  );
};

export const updatePendingUpload = ({ state }, { itemId, updates } = {}) => {
  if (!itemId || !updates) {
    return;
  }

  const pendingUpload = state.pendingUploads.find((item) => item.id === itemId);
  if (!pendingUpload) {
    return;
  }

  for (const [key, value] of Object.entries(updates)) {
    pendingUpload[key] = value;
  }
};

export const setCharacterId = ({ state }, { characterId } = {}) => {
  state.characterId = characterId;
};

export const setCharacterName = ({ state }, { characterName } = {}) => {
  state.characterName = characterName;
};

export const setProjectResolution = ({ state }, { projectResolution } = {}) => {
  state.projectResolution = requireProjectResolution(
    projectResolution ?? DEFAULT_PROJECT_RESOLUTION,
    "Project resolution",
  );
};

export const clearCharacterSpritesView = ({ state }) => {
  state.characterName = undefined;
  state.spritesData = EMPTY_TREE;
  state.tagsData = createEmptyTagCollection();
  state.activeTagIds = [];
  state.detailTagIds = [];
  state.detailTagIdsDirty = false;
  state.isDetailTagSelectOpen = false;
  state.pendingUploads = [];
  state.selectedItemId = undefined;
  state.selectedFolderId = undefined;
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewFileId = undefined;
  state.fullImagePreviewDisplayMode = FULL_IMAGE_PREVIEW_DISPLAY_MODE_CANVAS;
  state.projectResolution = DEFAULT_PROJECT_RESOLUTION;
  state.isEditDialogOpen = false;
  state.editItemId = undefined;
  state.editDefaultValues = {
    name: "",
    description: "",
    tagIds: [],
  };
  state.editPreviewFileId = undefined;
  state.editUploadResult = undefined;
  state.detailSelectedClipName = undefined;
  state.isSpritesheetDialogOpen = false;
  state.spritesheetDialogMode = "create";
  state.spritesheetDialogItemId = undefined;
  state.spritesheetDialogParentId = undefined;
  state.spritesheetDialogValues = buildSpritesheetDialogValues();
  state.spritesheetDialogPreviewUrl = undefined;
  state.spritesheetDialogImportData = undefined;
  state.spritesheetDialogDraftAnimations = {};
  state.spritesheetDialogSourceFiles = createSpritesheetDialogSourceFiles();
  state.spritesheetDialogSelectedClipName = undefined;
  state.spritesheetDialogRevision = 0;
  state.isClipFpsDialogOpen = false;
  state.clipFpsDialogClipName = undefined;
  state.clipFpsDialogValues = createClipFpsDialogValues();
  state.clipFpsDialogRevision = 0;
  state.isFolderNameDialogOpen = false;
  state.folderNameDialogItemId = undefined;
  state.folderNameDialogDefaultValues = {
    name: "",
    description: "",
  };
  state.isCreateTagDialogOpen = false;
  state.createTagDefaultValues = {
    ...CREATE_TAG_DEFAULT_VALUES,
  };
  state.createTagContext = {
    mode: undefined,
    itemId: undefined,
    draftTagIds: [],
  };
};

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  state.selectedItemId = itemId;
  if (itemId) {
    state.selectedFolderId = undefined;
  }
  state.detailSelectedClipName = undefined;
  state.isDetailTagSelectOpen = false;
  syncDetailTagIds({
    state,
    item: state.spritesData.items?.[itemId],
  });
};

export const setSelectedFolderId = ({ state }, { folderId } = {}) => {
  state.selectedFolderId = folderId;
  state.selectedItemId = undefined;
  state.detailSelectedClipName = undefined;
  state.isDetailTagSelectOpen = false;
  syncDetailTagIds({
    state,
    item: undefined,
  });
};

export const setSearchQuery = ({ state }, { query } = {}) => {
  state.searchQuery = query ?? "";
};

export const setActiveTagIds = ({ state }, { tagIds } = {}) => {
  setActiveTagIdsState({
    state,
    tagIds,
  });
};

export const setDetailTagIds = ({ state }, { tagIds } = {}) => {
  setDetailTagIdsState({
    state,
    tagIds,
  });
};

export const commitDetailTagIds = ({ state }, { tagIds } = {}) => {
  commitDetailTagIdsState({
    state,
    tagIds,
  });
};

export const setDetailTagPopoverOpen = ({ state }, { open, item } = {}) => {
  setDetailTagPopoverOpenState({
    state,
    open,
    item,
  });
};

export const openCreateTagDialog = (
  { state },
  { mode, itemId, draftTagIds } = {},
) => {
  openCreateTagDialogState({
    state,
    mode,
    itemId,
    draftTagIds,
  });
};

export const closeCreateTagDialog = ({ state }) => {
  closeCreateTagDialogState({ state });
};

export const openEditDialog = (
  { state },
  { itemId, defaultValues, previewFileId } = {},
) => {
  state.isEditDialogOpen = true;
  state.editItemId = itemId;
  state.editDefaultValues = {
    name: defaultValues?.name ?? "",
    description: defaultValues?.description ?? "",
    tagIds: defaultValues?.tagIds ?? [],
  };
  state.editPreviewFileId = previewFileId;
  state.editUploadResult = undefined;
};

export const closeEditDialog = ({ state }, _payload = {}) => {
  state.isEditDialogOpen = false;
  state.editItemId = undefined;
  state.editDefaultValues = {
    name: "",
    description: "",
    tagIds: [],
  };
  state.editPreviewFileId = undefined;
  state.editUploadResult = undefined;
};

export const openFolderNameDialog = (
  { state },
  { folderId, defaultValues } = {},
) => {
  state.isFolderNameDialogOpen = true;
  state.folderNameDialogItemId = folderId;
  state.folderNameDialogDefaultValues = {
    name: defaultValues?.name ?? "",
    description: defaultValues?.description ?? "",
  };
};

export const closeFolderNameDialog = ({ state }, _payload = {}) => {
  state.isFolderNameDialogOpen = false;
  state.folderNameDialogItemId = undefined;
  state.folderNameDialogDefaultValues = {
    name: "",
    description: "",
  };
};

export const setEditUpload = (
  { state },
  { uploadResult, previewFileId } = {},
) => {
  state.editUploadResult = uploadResult;
  state.editPreviewFileId = previewFileId;
};

export const openSpritesheetCreateDialog = (
  { state },
  { parentId, values, importData, previewUrl, sourceFiles } = {},
) => {
  state.isSpritesheetDialogOpen = true;
  state.spritesheetDialogMode = "create";
  state.spritesheetDialogItemId = undefined;
  state.spritesheetDialogParentId = parentId;
  state.spritesheetDialogValues = {
    ...buildSpritesheetDialogValues(),
    ...values,
  };
  state.spritesheetDialogImportData = importData;
  state.spritesheetDialogDraftAnimations = cloneSpritesheetDialogAnimations(
    importData?.animations,
    INITIAL_SPRITESHEET_CLIP_FPS,
  );
  state.spritesheetDialogPreviewUrl = previewUrl;
  state.spritesheetDialogSourceFiles = {
    ...createSpritesheetDialogSourceFiles(),
    ...sourceFiles,
  };
  state.spritesheetDialogSelectedClipName = undefined;
  closeClipFpsDialogState(state);
  state.spritesheetDialogRevision += 1;
};

export const openSpritesheetEditDialog = (
  { state },
  { itemId, values, previewUrl, sourceFiles, animations } = {},
) => {
  state.isSpritesheetDialogOpen = true;
  state.spritesheetDialogMode = "edit";
  state.spritesheetDialogItemId = itemId;
  state.spritesheetDialogParentId = undefined;
  state.spritesheetDialogValues = {
    ...buildSpritesheetDialogValues(),
    ...values,
  };
  state.spritesheetDialogImportData = undefined;
  state.spritesheetDialogDraftAnimations = cloneSpritesheetDialogAnimations(
    animations,
    INITIAL_SPRITESHEET_CLIP_FPS,
  );
  state.spritesheetDialogPreviewUrl = previewUrl;
  state.spritesheetDialogSourceFiles = {
    ...createSpritesheetDialogSourceFiles(),
    ...sourceFiles,
  };
  state.spritesheetDialogSelectedClipName = undefined;
  closeClipFpsDialogState(state);
  state.spritesheetDialogRevision += 1;
};

export const openSpritesheetPreviewDialog = (
  { state },
  { itemId, values, previewUrl } = {},
) => {
  state.isSpritesheetDialogOpen = true;
  state.spritesheetDialogMode = "preview";
  state.spritesheetDialogItemId = itemId;
  state.spritesheetDialogParentId = undefined;
  state.spritesheetDialogValues = {
    ...buildSpritesheetDialogValues(),
    ...values,
  };
  state.spritesheetDialogImportData = undefined;
  state.spritesheetDialogDraftAnimations = {};
  state.spritesheetDialogPreviewUrl = previewUrl;
  state.spritesheetDialogSourceFiles = createSpritesheetDialogSourceFiles();
  state.spritesheetDialogSelectedClipName = undefined;
  closeClipFpsDialogState(state);
  state.spritesheetDialogRevision += 1;
};

export const closeSpritesheetDialog = ({ state }) => {
  state.isSpritesheetDialogOpen = false;
  state.spritesheetDialogMode = "create";
  state.spritesheetDialogItemId = undefined;
  state.spritesheetDialogParentId = undefined;
  state.spritesheetDialogValues = buildSpritesheetDialogValues();
  state.spritesheetDialogPreviewUrl = undefined;
  state.spritesheetDialogImportData = undefined;
  state.spritesheetDialogDraftAnimations = {};
  state.spritesheetDialogSourceFiles = createSpritesheetDialogSourceFiles();
  state.spritesheetDialogSelectedClipName = undefined;
  closeClipFpsDialogState(state);
  state.spritesheetDialogRevision += 1;
};

export const setSpritesheetDialogValues = ({ state }, { values } = {}) => {
  state.spritesheetDialogValues = {
    ...state.spritesheetDialogValues,
    ...values,
  };
};

export const setSpritesheetDialogImport = (
  { state },
  { importData, previewUrl, values, sourceFiles } = {},
) => {
  state.spritesheetDialogImportData = importData;
  state.spritesheetDialogDraftAnimations = cloneSpritesheetDialogAnimations(
    importData?.animations,
    INITIAL_SPRITESHEET_CLIP_FPS,
  );
  state.spritesheetDialogPreviewUrl = previewUrl;
  state.spritesheetDialogSourceFiles = {
    ...createSpritesheetDialogSourceFiles(),
    ...sourceFiles,
  };
  state.spritesheetDialogValues = {
    ...state.spritesheetDialogValues,
    ...values,
  };
  state.spritesheetDialogSelectedClipName = undefined;
  closeClipFpsDialogState(state);
  state.spritesheetDialogRevision += 1;
};

export const setDetailSelectedClipName = ({ state }, { clipName } = {}) => {
  state.detailSelectedClipName = clipName;
};

export const setSpritesheetDialogClipFps = (
  { state },
  { clipName, fps } = {},
) => {
  if (typeof clipName !== "string" || clipName.length === 0) {
    return;
  }

  const animation = state.spritesheetDialogDraftAnimations?.[clipName];
  if (!animation) {
    return;
  }

  const normalizedFps = normalizeSpritesheetFps(fps);
  if (normalizedFps === undefined) {
    delete animation.fps;
    return;
  }

  animation.fps = normalizedFps;
  delete animation.animationSpeed;
};

export const setSpritesheetDialogSelectedClipName = (
  { state },
  { clipName } = {},
) => {
  state.spritesheetDialogSelectedClipName = clipName;
};

export const openClipFpsDialog = ({ state }, { clipName } = {}) => {
  if (typeof clipName !== "string" || clipName.length === 0) {
    return;
  }

  const dialogBaseItem =
    state.spritesData.items?.[state.spritesheetDialogItemId];
  const animation =
    state.spritesheetDialogDraftAnimations?.[clipName] ??
    state.spritesheetDialogImportData?.animations?.[clipName] ??
    dialogBaseItem?.animations?.[clipName];

  state.spritesheetDialogSelectedClipName = clipName;
  state.isClipFpsDialogOpen = true;
  state.clipFpsDialogClipName = clipName;
  state.clipFpsDialogValues = createClipFpsDialogValues(
    resolveSpritesheetAnimationFps(animation, INITIAL_SPRITESHEET_CLIP_FPS),
  );
  state.clipFpsDialogRevision += 1;
};

export const closeClipFpsDialog = ({ state }) => {
  closeClipFpsDialogState(state);
};

export const selectSelectedItem = ({ state }) => {
  const item = state.spritesData.items?.[state.selectedItemId];
  return item?.type === "image" || item?.type === "spritesheet"
    ? item
    : undefined;
};

export const selectSpriteItemById = ({ state }, { itemId } = {}) => {
  const item = state.spritesData.items?.[itemId];
  return item?.type === "image" || item?.type === "spritesheet"
    ? item
    : undefined;
};

export const selectFolderById = ({ state }, { folderId } = {}) => {
  const item = state.spritesData.items?.[folderId];
  return item?.type === "folder" ? item : undefined;
};

const spriteTreeContainsItem = ({ nodes, itemId } = {}) => {
  if (!itemId || !Array.isArray(nodes)) {
    return false;
  }

  for (const node of nodes) {
    if (node?.id === itemId) {
      return true;
    }

    if (spriteTreeContainsItem({ nodes: node?.children, itemId })) {
      return true;
    }
  }

  return false;
};

export const selectSpriteTreeContainsItem = ({ state }, { itemId } = {}) => {
  return spriteTreeContainsItem({
    nodes: state.spritesData?.tree,
    itemId,
  });
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
};

export const selectSelectedFolderId = ({ state }) => {
  return state.selectedFolderId;
};

export const selectCharacterId = ({ state }) => {
  return state.characterId;
};

export const selectSpritesheetDialogMode = ({ state }) =>
  state.spritesheetDialogMode;

export const selectSpritesheetDialogItemId = ({ state }) =>
  state.spritesheetDialogItemId;

export const selectSpritesheetDialogParentId = ({ state }) =>
  state.spritesheetDialogParentId;

export const selectSpritesheetDialogImportData = ({ state }) =>
  state.spritesheetDialogImportData;

export const selectSpritesheetDialogDraftAnimations = ({ state }) =>
  state.spritesheetDialogDraftAnimations;

export const selectSpritesheetDialogSourceFiles = ({ state }) =>
  state.spritesheetDialogSourceFiles;

export const selectSpritesheetDialogValues = ({ state }) =>
  state.spritesheetDialogValues;

export const selectSpritesheetDialogPreviewUrl = ({ state }) =>
  state.spritesheetDialogPreviewUrl;

export const selectClipFpsDialogClipName = ({ state }) =>
  state.clipFpsDialogClipName;

export const selectAdjacentSpriteItemId = (
  { state },
  { itemId, direction, distance = 1, clamp = false } = {},
) => {
  const viewData = selectViewData({ state });
  return resolveAdjacentSpriteItemId({
    visibleSpriteIds: selectVisibleSpriteIds({
      mediaGroups: viewData.mediaGroups,
      items: state.spritesData?.items,
    }),
    itemId,
    direction,
    distance,
    clamp,
  });
};

export const showFullImagePreview = ({ state }, { itemId } = {}) => {
  const item = state.spritesData.items?.[itemId];

  if (item?.type === "image" && item.fileId) {
    if (!state.fullImagePreviewVisible) {
      state.fullImagePreviewDisplayMode =
        FULL_IMAGE_PREVIEW_DISPLAY_MODE_CANVAS;
    }
    state.fullImagePreviewVisible = true;
    state.fullImagePreviewFileId = item.fileId;
  }
};

export const hideFullImagePreview = ({ state }, _payload = {}) => {
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewFileId = undefined;
};

export const setFullImagePreviewDisplayMode = (
  { state },
  { displayMode } = {},
) => {
  if (
    displayMode !== FULL_IMAGE_PREVIEW_DISPLAY_MODE_FIT &&
    displayMode !== FULL_IMAGE_PREVIEW_DISPLAY_MODE_CANVAS
  ) {
    return;
  }

  state.fullImagePreviewDisplayMode = displayMode;
};

export const selectFullImagePreviewVisible = ({ state }) =>
  state.fullImagePreviewVisible;

export const selectViewData = ({ state }) => {
  const flatItems = applyFolderRequiredRootDragOptions(
    toFlatItems(state.spritesData),
  );
  const rawFlatGroups = toFlatGroups(state.spritesData);
  const searchQuery = state.searchQuery.toLowerCase().trim();
  const activeTagIds = state.activeTagIds ?? [];
  const pendingByGroupId = new Map();
  const hiddenItemIdsByGroupId = new Map();

  for (const pendingUpload of state.pendingUploads ?? []) {
    const groupId = pendingUpload?.parentId;
    if (!groupId) {
      continue;
    }

    const existing = pendingByGroupId.get(groupId) ?? [];
    existing.push(buildPendingMediaItem(pendingUpload));
    pendingByGroupId.set(groupId, existing);

    if (typeof pendingUpload.resolvedItemId === "string") {
      const hiddenItemIds = hiddenItemIdsByGroupId.get(groupId) ?? new Set();
      hiddenItemIds.add(pendingUpload.resolvedItemId);
      hiddenItemIdsByGroupId.set(groupId, hiddenItemIds);
    }
  }

  const mediaGroups = rawFlatGroups
    .map((group) => {
      const hiddenItemIds = hiddenItemIdsByGroupId.get(group.id);
      const children = (group.children ?? [])
        .filter((item) => !hiddenItemIds?.has(item.id))
        .filter((item) => matchesSearch(item, searchQuery))
        .filter((item) =>
          matchesTagFilter({
            item,
            activeTagIds,
          }),
        )
        .map(buildMediaItem);
      const pendingChildren = (pendingByGroupId.get(group.id) ?? []).filter(
        (item) => matchesSearch(item, searchQuery),
      );
      const shouldDisplay =
        !searchQuery || children.length > 0 || pendingChildren.length > 0;

      return {
        ...group,
        children: [...children, ...pendingChildren],
        hasChildren: children.length > 0 || pendingChildren.length > 0,
        shouldDisplay,
      };
    })
    .filter((group) => group.shouldDisplay);

  const selectedItem = selectSelectedItem({ state });
  const previewImage =
    selectedItem?.type === "image" ? selectedItem : undefined;
  const projectResolution = requireProjectResolution(
    state.projectResolution,
    "Project resolution",
  );
  const selectedFolder = state.spritesData.items?.[state.selectedFolderId];
  const selectedDetailId = selectedItem ? selectedItem.id : selectedFolder?.id;
  const selectedDetailName = selectedItem?.name ?? selectedFolder?.name ?? "";
  const detailFields =
    selectedItem?.type === "image"
      ? buildImageDetailFields(selectedItem)
      : selectedItem?.type === "spritesheet"
        ? buildSpritesheetDetailFields(selectedItem)
        : buildFolderDetailFields(selectedFolder);
  const visibleSpriteIds = selectVisibleSpriteIds({
    mediaGroups,
    items: state.spritesData?.items,
  });
  const previousItemId = state.selectedItemId
    ? resolveAdjacentSpriteItemId({
        visibleSpriteIds,
        itemId: state.selectedItemId,
        direction: "previous",
      })
    : undefined;
  const nextItemId = state.selectedItemId
    ? resolveAdjacentSpriteItemId({
        visibleSpriteIds,
        itemId: state.selectedItemId,
        direction: "next",
      })
    : undefined;
  const tagViewData = buildTagViewData({
    state,
    selectedItem,
    createTagFormDefinition: createTagForm(),
  });
  const detailSelection = buildClipOptions(
    selectedItem?.type === "spritesheet" ? selectedItem.animations : {},
    state.detailSelectedClipName,
    INITIAL_SPRITESHEET_CLIP_FPS,
  );
  const detailSelectedClipName = detailSelection.selectedClipName;
  const detailPreviewAnimation =
    selectedItem?.type === "spritesheet"
      ? selectedItem.animations?.[detailSelectedClipName]
      : undefined;
  const spritesheetDialogBaseItem =
    state.spritesData.items?.[state.spritesheetDialogItemId];
  const spritesheetDialogDraftAnimations =
    state.spritesheetDialogDraftAnimations ?? {};
  const spritesheetDialogAnimations =
    Object.keys(spritesheetDialogDraftAnimations).length > 0
      ? spritesheetDialogDraftAnimations
      : (state.spritesheetDialogImportData?.animations ??
        spritesheetDialogBaseItem?.animations ??
        {});
  const spritesheetDialogSelection = buildClipOptions(
    spritesheetDialogAnimations,
    state.spritesheetDialogSelectedClipName,
    INITIAL_SPRITESHEET_CLIP_FPS,
  );
  const spritesheetDialogSelectedClipName =
    spritesheetDialogSelection.selectedClipName;
  const spritesheetDialogPreviewAnimation =
    spritesheetDialogAnimations?.[spritesheetDialogSelectedClipName] ??
    undefined;
  const spritesheetDialogAtlas =
    state.spritesheetDialogImportData?.jsonData ??
    spritesheetDialogBaseItem?.jsonData ??
    undefined;
  const spritesheetDialogImageSourcePreviewUrl =
    state.spritesheetDialogPreviewUrl;
  const spritesheetDialogImageSourceFileId =
    spritesheetDialogImageSourcePreviewUrl
      ? undefined
      : spritesheetDialogBaseItem?.fileId;
  const spritesheetDialogPreviewFileId = state.spritesheetDialogPreviewUrl
    ? undefined
    : spritesheetDialogBaseItem?.fileId;
  const detailPreviewKey = `${state.selectedItemId ?? "empty"}-${detailSelectedClipName ?? "default"}-${detailPreviewAnimation?.fps ?? detailPreviewAnimation?.animationSpeed ?? ""}`;
  const spritesheetDialogPreviewSourceKey =
    state.spritesheetDialogPreviewUrl ??
    spritesheetDialogPreviewFileId ??
    "empty";
  const spritesheetDialogPreviewKey = `${state.spritesheetDialogRevision}-${spritesheetDialogSelectedClipName ?? "default"}-${spritesheetDialogPreviewSourceKey}-${spritesheetDialogPreviewAnimation?.fps ?? spritesheetDialogPreviewAnimation?.animationSpeed ?? ""}`;
  const spritesheetDialogHasAtlasSource = Boolean(
    state.spritesheetDialogSourceFiles?.atlasFile ||
      spritesheetDialogBaseItem?.jsonData,
  );
  const spritesheetDialogAtlasFieldValue =
    state.spritesheetDialogSourceFiles?.atlasFile?.name ?? "";
  const isSpritesheetDialogPreviewMode =
    state.spritesheetDialogMode === "preview";

  return {
    flatItems,
    mediaGroups,
    resourceCategory: "assets",
    selectedResourceId: "characters",
    selectedItemId: state.selectedItemId,
    selectedFolderId: state.selectedFolderId,
    selectedDetailId,
    selectedDetailName,
    selectedItemName: selectedDetailName,
    ...tagViewData,
    detailFields,
    ...buildMobileResourcePageViewData({
      state,
      detailFields,
      hiddenMobileDetailSlots: [
        "image-file-id",
        "spritesheet-preview",
        "spritesheet-animations",
      ],
    }),
    selectedPreviewFileId:
      selectedItem?.type === "image"
        ? getPreviewFileId(selectedItem)
        : undefined,
    selectedItemType: selectedItem?.type,
    detailClipOptions: detailSelection.clipOptions,
    detailSelectedClipName,
    detailPreviewAnimation,
    detailPreviewAtlas:
      selectedItem?.type === "spritesheet" ? selectedItem.jsonData : undefined,
    detailPreviewFileId:
      selectedItem?.type === "spritesheet" ? selectedItem.fileId : undefined,
    detailPreviewKey,
    detailPreviewPaused: state.isSpritesheetDialogOpen,
    searchQuery: state.searchQuery,
    uploadText: "Upload",
    acceptedFileTypes: [".jpg", ".jpeg", ".png", ".webp", ".json"],
    imageHeight: IMAGE_CARD_HEIGHT,
    maxWidth: IMAGE_CARD_MAX_WIDTH,
    fullImagePreviewVisible: state.fullImagePreviewVisible,
    fullImagePreviewFileId: state.fullImagePreviewFileId,
    fullImagePreviewFrameStyle: createPreviewFrameStyle(projectResolution),
    fullImagePreviewImageWrapperStyle: createPreviewImageWrapperStyle({
      image: previewImage,
      displayMode: state.fullImagePreviewDisplayMode,
      projectResolution,
    }),
    fullImagePreviewDisplayMode: state.fullImagePreviewDisplayMode,
    fullImagePreviewFitModeButton: createPreviewModeButtonViewData({
      displayMode: state.fullImagePreviewDisplayMode,
      mode: FULL_IMAGE_PREVIEW_DISPLAY_MODE_FIT,
    }),
    fullImagePreviewCanvasModeButton: createPreviewModeButtonViewData({
      displayMode: state.fullImagePreviewDisplayMode,
      mode: FULL_IMAGE_PREVIEW_DISPLAY_MODE_CANVAS,
    }),
    fullImagePreviewPreviousVisible: Boolean(previousItemId),
    fullImagePreviewNextVisible: Boolean(nextItemId),
    folderContextMenuItems,
    itemContextMenuItems,
    emptyContextMenuItems,
    centerItemContextMenuItems,
    title: state.characterName,
    isEditDialogOpen: state.isEditDialogOpen,
    editForm: createEditForm({
      tagOptions: tagViewData.tagFilterOptions,
    }),
    editDefaultValues: state.editDefaultValues,
    editPreviewFileId: state.editPreviewFileId,
    isSpritesheetDialogOpen: state.isSpritesheetDialogOpen,
    isSpritesheetDialogPreviewMode,
    spritesheetDialogMode: state.spritesheetDialogMode,
    spritesheetDialogTitle:
      state.spritesheetDialogMode === "create"
        ? "Add Spritesheet"
        : state.spritesheetDialogMode === "edit"
          ? "Edit Spritesheet"
          : "",
    spritesheetDialogForm: buildSpritesheetDialogForm(
      state.spritesheetDialogMode === "create"
        ? "Add Spritesheet"
        : "Update Spritesheet",
    ),
    spritesheetDialogFormKey: `${state.spritesheetDialogMode}-${state.spritesheetDialogItemId ?? "new"}-${state.spritesheetDialogRevision}`,
    spritesheetDialogValues: state.spritesheetDialogValues,
    spritesheetDialogPreviewUrl: state.spritesheetDialogPreviewUrl,
    spritesheetDialogPreviewFileId,
    spritesheetDialogPreviewKey,
    spritesheetDialogPreviewAtlas: spritesheetDialogAtlas,
    spritesheetDialogPreviewAnimation,
    spritesheetDialogImageSourcePreviewUrl,
    spritesheetDialogImageSourceFileId,
    spritesheetDialogClipOptions: spritesheetDialogSelection.clipOptions,
    spritesheetDialogSelectedClipName,
    spritesheetDialogAtlasSourceLabel: "Upload",
    spritesheetDialogAtlasFieldValue,
    spritesheetDialogAtlasFieldPlaceholder: spritesheetDialogHasAtlasSource
      ? "Current spritesheet JSON"
      : "No JSON selected",
    isClipFpsDialogOpen: state.isClipFpsDialogOpen,
    clipFpsDialogValues: state.clipFpsDialogValues,
    clipFpsDialogKey: `${state.clipFpsDialogClipName ?? "none"}-${state.clipFpsDialogRevision}`,
    clipFpsForm: buildClipFpsForm(state.clipFpsDialogClipName),
    isFolderNameDialogOpen: state.isFolderNameDialogOpen,
    folderNameDialogItemId: state.folderNameDialogItemId,
    folderNameForm,
    folderNameDialogDefaultValues: state.folderNameDialogDefaultValues,
    startCollapsedFileExplorer: shouldStartCollapsedFileExplorer({
      flatItems,
      threshold: AUTO_COLLAPSE_FILE_EXPLORER_ITEM_THRESHOLD,
    }),
  };
};
