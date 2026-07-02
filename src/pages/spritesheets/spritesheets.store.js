import { formatFileSize } from "../../internal/files.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";
import {
  INITIAL_SPRITESHEET_CLIP_FPS,
  formatSpritesheetFps,
  normalizeSpritesheetAnimationsFps,
  normalizeSpritesheetFps,
  resolveSpritesheetAnimationFps,
} from "../../internal/spritesheets.js";
import {
  buildTagFilterOptions,
  createEmptyTagCollection,
  matchesTagAwareSearch,
  matchesTagFilter,
} from "../../internal/resourceTags.js";
import {
  DEFAULT_FILE_EXPLORER_AUTO_COLLAPSE_THRESHOLD,
  shouldStartCollapsedFileExplorer,
} from "../../internal/ui/resourcePages/media/mediaPageShared.js";
import { formatI18nCopy } from "../../internal/ui/i18nCopy.js";
import {
  buildMobileResourcePageViewData,
  closeMobileResourceFileExplorerState,
  createMobileResourcePageState,
  openMobileResourceFileExplorerState,
  selectIsMobileFileExplorerOpenState,
  selectIsTouchModeState,
  selectSuppressMobileDetailSheetState,
  setMobileResourceDetailSheetSuppressedState,
  setMobileResourcePageUiConfigState,
} from "../../internal/ui/resourcePages/mobileResourcePage.js";
import { selectSpritesheetsPageCopy } from "./support/spritesheetsPageCopy.js";

const EMPTY_TREE = { tree: [], items: {} };
export const SPRITESHEET_TAG_SCOPE_KEY = "spritesheets";
const AUTO_COLLAPSE_FILE_EXPLORER_ITEM_THRESHOLD =
  DEFAULT_FILE_EXPLORER_AUTO_COLLAPSE_THRESHOLD;
const CREATE_TAG_DEFAULT_VALUES = Object.freeze({
  name: "",
});

const createTagForm = (copy = {}) => ({
  title: copy.createTagTitle ?? "Create Tag",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: copy.tagNameLabel ?? "Tag Name",
      required: true,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: copy.createTagButton ?? "Create Tag",
      },
    ],
  },
});

const createFolderContextMenuItems = (copy = {}) => [
  {
    label: copy.newFolderMenuItem ?? "New Folder",
    type: "item",
    value: "new-child-folder",
  },
  {
    label: copy.renameMenuItem ?? "Rename",
    type: "item",
    value: "rename-item",
  },
  {
    label: copy.deleteMenuItem ?? "Delete",
    type: "item",
    value: "delete-item",
  },
];

const createItemContextMenuItems = (copy = {}) => [
  {
    label: copy.renameMenuItem ?? "Rename",
    type: "item",
    value: "rename-item",
  },
  {
    label: copy.deleteMenuItem ?? "Delete",
    type: "item",
    value: "delete-item",
  },
];

const createEmptyContextMenuItems = (copy = {}) => [
  {
    label: copy.newFolderMenuItem ?? "New Folder",
    type: "item",
    value: "new-item",
  },
];

const createCenterItemContextMenuItems = (copy = {}) => [
  { label: copy.editMenuItem ?? "Edit", type: "item", value: "edit-item" },
  {
    label: copy.deleteMenuItem ?? "Delete",
    type: "item",
    value: "delete-item",
  },
];

const createDialogForm = (copy = {}, submitLabel = copy.saveButton) => ({
  title: copy.spritesheetTitle ?? "Spritesheet",
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
    {
      type: "slot",
      slot: "spritesheet-image-source",
      label: copy.imageLabel ?? "Image",
    },
    {
      type: "slot",
      slot: "spritesheet-atlas-source",
      label: copy.spritesheetJsonLabel ?? "Spritesheet JSON",
    },
    {
      name: "tagIds",
      type: "tag-select",
      label: copy.tagsLabel ?? "Tags",
      placeholder: copy.selectTagsPlaceholder ?? "Select tags",
      addOption: {
        label: copy.addTagOption ?? "Add tag",
      },
      required: false,
    },
    {
      name: "width",
      type: "input-number",
      label: copy.defaultWidthLabel ?? "Default Width",
      required: false,
    },
    {
      name: "height",
      type: "input-number",
      label: copy.defaultHeightLabel ?? "Default Height",
      required: false,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: submitLabel ?? copy.saveButton ?? "Save",
      },
    ],
  },
});

const createFolderNameForm = (copy = {}) => ({
  title: copy.editFolderTitle ?? "Edit Folder",
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
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: copy.saveButton ?? "Save",
        validate: true,
      },
    ],
  },
});

const createClipFpsForm = (copy = {}) => ({
  title: copy.clipFpsTitle ?? "Clip FPS",
  fields: [
    {
      name: "fps",
      type: "input-number",
      label: copy.fpsLabel ?? "FPS",
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
        label: copy.updateFpsButton ?? "Update FPS",
      },
    ],
  },
});

const buildClipFpsForm = (clipName, copy = {}) => {
  const form = createClipFpsForm(copy);
  return {
    ...form,
    title:
      typeof clipName === "string" && clipName.length > 0
        ? formatI18nCopy(copy.clipFpsTitleWithName ?? "Clip FPS: {clipName}", {
            clipName,
          })
        : form.title,
  };
};

const matchesSearch = matchesTagAwareSearch;

const buildMediaItem = (item) => ({
  id: item.id,
  name: item.name,
  cardKind: "image",
  previewFileId: item.thumbnailFileId ?? item.fileId,
  canPreview: false,
});

const resolveSheetWidth = (item) =>
  item?.sheetWidth ?? item?.jsonData?.meta?.size?.w ?? "";

const resolveSheetHeight = (item) =>
  item?.sheetHeight ?? item?.jsonData?.meta?.size?.h ?? "";

const resolveFrameCount = (item) =>
  item?.frameCount ?? Object.keys(item?.jsonData?.frames ?? {}).length ?? 0;

const cloneDialogAnimations = (
  animations = {},
  missingClipFps = INITIAL_SPRITESHEET_CLIP_FPS,
) => normalizeSpritesheetAnimationsFps(animations, missingClipFps);

const buildClipOptions = (
  animations = {},
  selectedClipName,
  missingClipFps = INITIAL_SPRITESHEET_CLIP_FPS,
  copy = {},
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
      loopLabel: clip.loop
        ? (copy.loopLabel ?? "Loop")
        : (copy.onceLabel ?? "Once"),
      summaryLabel: formatI18nCopy(
        copy.clipSummaryTemplate ?? "{frameCount} frames • {fpsLabel} fps",
        {
          frameCount: String(clip.frameCount),
          fpsLabel: clip.fpsLabel,
        },
      ),
      borderColor: clip.name === fallbackSelectedClipName ? "ac" : "bo",
      backgroundColor: clip.name === fallbackSelectedClipName ? "mu" : "bg",
    })),
  };
};

const buildDetailFields = (item, copy = {}) => {
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
      slot: "spritesheet-tags",
      label: copy.tagsLabel ?? "Tags",
    },
    {
      type: "text",
      label: copy.fileTypeLabel ?? "File Type",
      value: item.fileType ?? "",
    },
    {
      type: "text",
      label: copy.fileSizeLabel ?? "File Size",
      value: formatFileSize(item.fileSize),
    },
    {
      type: "text",
      label: copy.defaultSizeLabel ?? "Default Size",
      value: item.width && item.height ? `${item.width} × ${item.height}` : "",
    },
    {
      type: "text",
      label: copy.sheetSizeLabel ?? "Sheet Size",
      value:
        resolveSheetWidth(item) && resolveSheetHeight(item)
          ? `${resolveSheetWidth(item)} × ${resolveSheetHeight(item)}`
          : "",
    },
    {
      type: "text",
      label: copy.framesLabel ?? "Frames",
      value: String(resolveFrameCount(item) || ""),
    },
    {
      type: "text",
      label: copy.animationsLabel ?? "Animations",
      value: String(animationCount || ""),
    },
    {
      type: "slot",
      slot: "spritesheet-animations",
      label: "",
    },
  ];
};

const buildFolderDetailFields = (folder, copy = {}) => {
  if (!folder) {
    return [];
  }

  return [
    {
      type: "text",
      label: copy.typeLabel ?? "Type",
      value: copy.folderTypeValue ?? "folder",
    },
    {
      type: "description",
      value: folder.description ?? "",
    },
  ];
};

const selectDataItem = (state, itemId) => {
  const item = state.data?.items?.[itemId];
  return item?.type === "spritesheet" ? item : undefined;
};

const selectDataFolder = (state, folderId) => {
  const item = state.data?.items?.[folderId];
  return item?.type === "folder" ? item : undefined;
};

const buildMediaGroups = (state) => {
  const rawGroups = toFlatGroups(state.data);
  const searchQuery = (state.searchQuery ?? "").toLowerCase().trim();

  return rawGroups
    .map((group) => {
      const children = (group.children ?? [])
        .filter((item) => matchesSearch(item, searchQuery))
        .map(buildMediaItem);
      const shouldDisplay = !searchQuery || children.length > 0;

      return {
        ...group,
        children,
        hasChildren: children.length > 0,
        shouldDisplay,
      };
    })
    .filter((group) => group.shouldDisplay);
};

const buildDialogValues = (item) => ({
  name: item?.name ?? "",
  description: item?.description ?? "",
  tagIds: item?.tagIds ?? [],
  width: item?.width ?? "",
  height: item?.height ?? "",
});

const createDialogSourceFiles = () => ({
  pngFile: undefined,
  atlasFile: undefined,
});

const createClipFpsDialogValues = (fps = INITIAL_SPRITESHEET_CLIP_FPS) => ({
  fps,
});

export const createInitialState = () => ({
  data: EMPTY_TREE,
  tagsData: createEmptyTagCollection(),
  activeTagIds: [],
  detailTagIds: [],
  detailTagIdsDirty: false,
  isDetailTagSelectOpen: false,
  selectedItemId: undefined,
  selectedFolderId: undefined,
  searchQuery: "",
  ...createMobileResourcePageState(),
  detailSelectedClipName: undefined,
  isDialogOpen: false,
  isCreateTagDialogOpen: false,
  createTagDefaultValues: {
    ...CREATE_TAG_DEFAULT_VALUES,
  },
  createTagContext: {
    mode: undefined,
    itemId: undefined,
    draftTagIds: [],
  },
  dialogMode: "create",
  dialogItemId: undefined,
  dialogParentId: undefined,
  dialogValues: buildDialogValues(),
  dialogPreviewUrl: undefined,
  dialogImportData: undefined,
  dialogDraftAnimations: {},
  dialogSourceFiles: createDialogSourceFiles(),
  dialogSelectedClipName: undefined,
  dialogRevision: 0,
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

const syncDetailTagIds = (state, { preserveDirty = false } = {}) => {
  if (preserveDirty && state.detailTagIdsDirty) {
    return;
  }

  const item = state.selectedItemId
    ? state.data?.items?.[state.selectedItemId]
    : undefined;
  state.detailTagIds = Array.isArray(item?.tagIds) ? [...item.tagIds] : [];
  state.detailTagIdsDirty = false;
};

export const setItems = ({ state }, { data } = {}) => {
  state.data = data ?? EMPTY_TREE;
  if (
    state.selectedFolderId &&
    state.data?.items?.[state.selectedFolderId]?.type !== "folder"
  ) {
    state.selectedFolderId = undefined;
  }
  syncDetailTagIds(state, { preserveDirty: true });
};

export const setSelectedItemId = (
  { state },
  { itemId, suppressMobileDetailSheet = false } = {},
) => {
  state.selectedItemId = itemId;
  setMobileResourceDetailSheetSuppressedState(state, {
    itemId,
    suppressMobileDetailSheet,
  });
  if (itemId !== undefined) {
    state.selectedFolderId = undefined;
  }
  state.detailSelectedClipName = undefined;
  state.isDetailTagSelectOpen = false;
  syncDetailTagIds(state);
};

export const selectIsTouchMode = selectIsTouchModeState;

export const selectIsMobileFileExplorerOpen =
  selectIsMobileFileExplorerOpenState;

export const selectSuppressMobileDetailSheet =
  selectSuppressMobileDetailSheetState;

export const setSelectedFolderId = ({ state }, { folderId } = {}) => {
  state.selectedFolderId = folderId;
  if (folderId !== undefined) {
    state.selectedItemId = undefined;
    setMobileResourceDetailSheetSuppressedState(state, {
      itemId: undefined,
    });
    state.detailSelectedClipName = undefined;
    state.isDetailTagSelectOpen = false;
    syncDetailTagIds(state);
  }
};

export const setSearchQuery = ({ state }, { value } = {}) => {
  state.searchQuery = value ?? "";
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

export const setTagsData = ({ state }, { tagsData } = {}) => {
  state.tagsData = tagsData ?? createEmptyTagCollection();
  const validTagIds = new Set(Object.keys(state.tagsData.items ?? {}));
  state.activeTagIds = state.activeTagIds.filter((tagId) =>
    validTagIds.has(tagId),
  );
  state.detailTagIds = state.detailTagIds.filter((tagId) =>
    validTagIds.has(tagId),
  );
};

export const setActiveTagIds = ({ state }, { tagIds } = {}) => {
  const validTagIds = new Set(Object.keys(state.tagsData.items ?? {}));
  state.activeTagIds = [
    ...new Set((tagIds ?? []).filter((tagId) => validTagIds.has(tagId))),
  ];
};

export const setDetailTagIds = ({ state }, { tagIds } = {}) => {
  const validTagIds = new Set(Object.keys(state.tagsData.items ?? {}));
  state.detailTagIds = [
    ...new Set((tagIds ?? []).filter((tagId) => validTagIds.has(tagId))),
  ];
  state.detailTagIdsDirty = true;
};

export const commitDetailTagIds = ({ state }, { tagIds } = {}) => {
  const validTagIds = new Set(Object.keys(state.tagsData.items ?? {}));
  state.detailTagIds = [
    ...new Set((tagIds ?? []).filter((tagId) => validTagIds.has(tagId))),
  ];
  state.detailTagIdsDirty = false;
};

export const setDetailTagPopoverOpen = ({ state }, { open, item } = {}) => {
  state.isDetailTagSelectOpen = !!open;
  if (!state.isDetailTagSelectOpen && state.detailTagIdsDirty) {
    state.detailTagIds = Array.isArray(item?.tagIds) ? [...item.tagIds] : [];
    state.detailTagIdsDirty = false;
  }
};

export const setDetailSelectedClipName = ({ state }, { clipName } = {}) => {
  state.detailSelectedClipName = clipName;
};

export const openCreateDialog = (
  { state },
  { parentId, values, importData, previewUrl, sourceFiles } = {},
) => {
  state.isDialogOpen = true;
  state.dialogMode = "create";
  state.dialogItemId = undefined;
  state.dialogParentId = parentId;
  state.dialogValues = {
    ...buildDialogValues(),
    ...values,
  };
  state.dialogImportData = importData;
  state.dialogDraftAnimations = cloneDialogAnimations(
    importData?.animations,
    INITIAL_SPRITESHEET_CLIP_FPS,
  );
  state.dialogPreviewUrl = previewUrl;
  state.dialogSourceFiles = {
    ...createDialogSourceFiles(),
    ...sourceFiles,
  };
  state.dialogSelectedClipName = undefined;
  closeClipFpsDialogState(state);
  state.dialogRevision += 1;
};

export const openEditDialog = (
  { state },
  { itemId, values, previewUrl, sourceFiles, animations } = {},
) => {
  state.isDialogOpen = true;
  state.dialogMode = "edit";
  state.dialogItemId = itemId;
  state.dialogParentId = undefined;
  state.dialogValues = {
    ...buildDialogValues(),
    ...values,
  };
  state.dialogImportData = undefined;
  state.dialogDraftAnimations = cloneDialogAnimations(
    animations,
    INITIAL_SPRITESHEET_CLIP_FPS,
  );
  state.dialogPreviewUrl = previewUrl;
  state.dialogSourceFiles = {
    ...createDialogSourceFiles(),
    ...sourceFiles,
  };
  state.dialogSelectedClipName = undefined;
  closeClipFpsDialogState(state);
  state.dialogRevision += 1;
};

export const openPreviewDialog = (
  { state },
  { itemId, values, previewUrl } = {},
) => {
  state.isDialogOpen = true;
  state.dialogMode = "preview";
  state.dialogItemId = itemId;
  state.dialogParentId = undefined;
  state.dialogValues = {
    ...buildDialogValues(),
    ...values,
  };
  state.dialogImportData = undefined;
  state.dialogDraftAnimations = {};
  state.dialogPreviewUrl = previewUrl;
  state.dialogSourceFiles = createDialogSourceFiles();
  state.dialogSelectedClipName = undefined;
  closeClipFpsDialogState(state);
  state.dialogRevision += 1;
};

export const closeDialog = ({ state }) => {
  state.isDialogOpen = false;
  state.dialogMode = "create";
  state.dialogItemId = undefined;
  state.dialogParentId = undefined;
  state.dialogValues = buildDialogValues();
  state.dialogPreviewUrl = undefined;
  state.dialogImportData = undefined;
  state.dialogDraftAnimations = {};
  state.dialogSourceFiles = createDialogSourceFiles();
  state.dialogSelectedClipName = undefined;
  closeClipFpsDialogState(state);
  state.dialogRevision += 1;
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

export const openCreateTagDialog = (
  { state },
  { mode, itemId, draftTagIds } = {},
) => {
  state.isCreateTagDialogOpen = true;
  state.createTagDefaultValues = {
    ...CREATE_TAG_DEFAULT_VALUES,
  };
  state.createTagContext = {
    mode: mode ?? "item",
    itemId,
    draftTagIds: Array.isArray(draftTagIds) ? [...draftTagIds] : [],
  };
};

export const closeCreateTagDialog = ({ state }) => {
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

export const setDialogValues = ({ state }, { values } = {}) => {
  state.dialogValues = {
    ...state.dialogValues,
    ...values,
  };
};

export const setDialogImport = (
  { state },
  { importData, previewUrl, values, sourceFiles } = {},
) => {
  state.dialogImportData = importData;
  state.dialogDraftAnimations = cloneDialogAnimations(
    importData?.animations,
    INITIAL_SPRITESHEET_CLIP_FPS,
  );
  state.dialogPreviewUrl = previewUrl;
  state.dialogSourceFiles = {
    ...createDialogSourceFiles(),
    ...sourceFiles,
  };
  state.dialogValues = {
    ...state.dialogValues,
    ...values,
  };
  state.dialogSelectedClipName = undefined;
  closeClipFpsDialogState(state);
  state.dialogRevision += 1;
};

export const setDialogClipFps = ({ state }, { clipName, fps } = {}) => {
  if (typeof clipName !== "string" || clipName.length === 0) {
    return;
  }

  const animation = state.dialogDraftAnimations?.[clipName];
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

export const setDialogSelectedClipName = ({ state }, { clipName } = {}) => {
  state.dialogSelectedClipName = clipName;
};

export const openClipFpsDialog = ({ state }, { clipName } = {}) => {
  if (typeof clipName !== "string" || clipName.length === 0) {
    return;
  }

  const dialogBaseItem = selectDataItem(state, state.dialogItemId);
  const animation =
    state.dialogDraftAnimations?.[clipName] ??
    state.dialogImportData?.animations?.[clipName] ??
    dialogBaseItem?.animations?.[clipName];

  state.dialogSelectedClipName = clipName;
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

export const selectSelectedItem = ({ state }) =>
  selectDataItem(state, state.selectedItemId);

export const selectItemById = ({ state }, { itemId } = {}) =>
  selectDataItem(state, itemId);

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const selectSelectedFolderId = ({ state }) => state.selectedFolderId;

export const selectFolderById = ({ state }, { folderId } = {}) =>
  selectDataFolder(state, folderId);

export const selectFolderNameDialogItemId = ({ state }) =>
  state.folderNameDialogItemId;

export const selectTagsData = ({ state }) => state.tagsData;

export const selectActiveTagIds = ({ state }) => state.activeTagIds ?? [];

export const selectDetailTagIds = ({ state }) => state.detailTagIds ?? [];

export const selectCreateTagContext = ({ state }) =>
  state.createTagContext ?? {};

export const selectDialogMode = ({ state }) => state.dialogMode;

export const selectDialogItemId = ({ state }) => state.dialogItemId;

export const selectDialogParentId = ({ state }) => state.dialogParentId;

export const selectDialogImportData = ({ state }) => state.dialogImportData;

export const selectDialogDraftAnimations = ({ state }) =>
  state.dialogDraftAnimations;

export const selectDialogSourceFiles = ({ state }) => state.dialogSourceFiles;

export const selectDialogValues = ({ state }) => state.dialogValues;

export const selectDialogPreviewUrl = ({ state }) => state.dialogPreviewUrl;

export const selectClipFpsDialogClipName = ({ state }) =>
  state.clipFpsDialogClipName;

export const selectViewData = ({ state, i18n }) => {
  const copy = selectSpritesheetsPageCopy(i18n);
  const flatItems = applyFolderRequiredRootDragOptions(toFlatItems(state.data));
  const activeTagIds = state.activeTagIds ?? [];
  const mediaGroups = buildMediaGroups(state)
    .map((group) => ({
      ...group,
      children: (group.children ?? []).filter((child) =>
        matchesTagFilter({
          item: state.data?.items?.[child.id],
          activeTagIds,
        }),
      ),
    }))
    .filter((group) => group.children.length > 0 || activeTagIds.length === 0);
  const selectedItem = selectDataItem(state, state.selectedItemId);
  const selectedFolder = selectDataFolder(state, state.selectedFolderId);
  const selectedDetailId = selectedItem?.id ?? selectedFolder?.id;
  const selectedDetailName = selectedItem?.name ?? selectedFolder?.name ?? "";
  const detailSelection = buildClipOptions(
    selectedItem?.animations,
    state.detailSelectedClipName,
    INITIAL_SPRITESHEET_CLIP_FPS,
    copy,
  );
  const detailSelectedClipName = detailSelection.selectedClipName;
  const detailPreviewAnimation =
    selectedItem?.animations?.[detailSelectedClipName];

  const dialogBaseItem = selectDataItem(state, state.dialogItemId);
  const dialogDraftAnimations = state.dialogDraftAnimations ?? {};
  const dialogAnimations =
    Object.keys(dialogDraftAnimations).length > 0
      ? dialogDraftAnimations
      : (state.dialogImportData?.animations ??
        dialogBaseItem?.animations ??
        {});
  const dialogSelection = buildClipOptions(
    dialogAnimations,
    state.dialogSelectedClipName,
    INITIAL_SPRITESHEET_CLIP_FPS,
    copy,
  );
  const dialogSelectedClipName = dialogSelection.selectedClipName;

  const dialogPreviewAnimation =
    dialogAnimations?.[dialogSelectedClipName] ?? undefined;
  const dialogAtlas =
    state.dialogImportData?.jsonData ?? dialogBaseItem?.jsonData ?? undefined;
  const dialogImageSourcePreviewUrl = state.dialogPreviewUrl;
  const dialogImageSourceFileId = dialogImageSourcePreviewUrl
    ? undefined
    : dialogBaseItem?.fileId;
  const dialogPreviewFileId = state.dialogPreviewUrl
    ? undefined
    : dialogBaseItem?.fileId;
  const detailPreviewKey = `${state.selectedItemId ?? "empty"}-${detailSelectedClipName ?? "default"}-${detailPreviewAnimation?.fps ?? detailPreviewAnimation?.animationSpeed ?? ""}`;
  const dialogPreviewSourceKey =
    state.dialogPreviewUrl ?? dialogPreviewFileId ?? "empty";
  const dialogPreviewKey = `${state.dialogRevision}-${dialogSelectedClipName ?? "default"}-${dialogPreviewSourceKey}-${dialogPreviewAnimation?.fps ?? dialogPreviewAnimation?.animationSpeed ?? ""}`;
  const dialogHasAtlasSource = Boolean(
    state.dialogSourceFiles?.atlasFile || dialogBaseItem?.jsonData,
  );
  const dialogAtlasFieldValue = state.dialogSourceFiles?.atlasFile?.name ?? "";
  const isDialogPreviewMode = state.dialogMode === "preview";
  const detailFields = selectedItem
    ? buildDetailFields(selectedItem, copy)
    : buildFolderDetailFields(selectedFolder, copy);
  const dialogSubmitLabel =
    state.dialogMode === "create"
      ? (copy.addSpritesheetButton ?? "Add Spritesheet")
      : (copy.updateSpritesheetButton ?? "Update Spritesheet");
  return {
    resourceCategory: "animatedAssets",
    selectedResourceId: "spritesheets",
    title: copy.title ?? "Spritesheets",
    uploadText: copy.addText ?? "Add",
    uploadIcon: "plus",
    acceptedFileTypes: [".png", ".json"],
    flatItems,
    mediaGroups,
    tagFilterOptions: buildTagFilterOptions({
      tagsCollection: state.tagsData,
    }),
    selectedTagFilterValues: activeTagIds,
    tagFilterPlaceholder: copy.tagFilterPlaceholder ?? "Filter tags",
    selectedItemId: state.selectedItemId,
    selectedFolderId: state.selectedFolderId,
    selectedDetailId,
    selectedDetailName,
    selectedItemName: selectedDetailName,
    selectedItemTagIds: selectedItem?.tagIds ?? [],
    detailTagDraftValues: state.detailTagIds ?? [],
    isDetailTagSelectOpen: !!state.isDetailTagSelectOpen,
    detailTagAddOption: {
      label: copy.addTagOption ?? "Add tag",
    },
    detailFields,
    ...buildMobileResourcePageViewData({
      state,
      detailFields,
      hiddenMobileDetailSlots: [
        "spritesheet-preview",
        "spritesheet-animations",
      ],
    }),
    searchQuery: state.searchQuery,
    searchPlaceholder: copy.searchPlaceholder ?? "Search...",
    folderContextMenuItems: createFolderContextMenuItems(copy),
    itemContextMenuItems: createItemContextMenuItems(copy),
    emptyContextMenuItems: createEmptyContextMenuItems(copy),
    centerItemContextMenuItems: createCenterItemContextMenuItems(copy),
    startCollapsedFileExplorer: shouldStartCollapsedFileExplorer({
      flatItems,
      threshold: AUTO_COLLAPSE_FILE_EXPLORER_ITEM_THRESHOLD,
    }),
    selectedPreviewFileId:
      selectedItem?.thumbnailFileId ?? selectedItem?.fileId,
    detailClipOptions: detailSelection.clipOptions,
    detailSelectedClipName,
    detailPreviewAnimation,
    detailPreviewAtlas: selectedItem?.jsonData,
    detailPreviewFileId: selectedItem?.fileId,
    detailPreviewKey,
    detailPreviewPaused: state.isDialogOpen,
    isDialogOpen: state.isDialogOpen,
    isDialogPreviewMode,
    dialogMode: state.dialogMode,
    dialogTitle:
      state.dialogMode === "create"
        ? (copy.addSpritesheetTitle ?? "Add Spritesheet")
        : state.dialogMode === "edit"
          ? (copy.editSpritesheetTitle ?? "Edit Spritesheet")
          : "",
    dialogSubmitLabel,
    dialogForm: createDialogForm(copy, dialogSubmitLabel),
    dialogFormKey: `${state.dialogMode}-${state.dialogItemId ?? "new"}-${state.dialogRevision}`,
    dialogValues: state.dialogValues,
    isCreateTagDialogOpen: state.isCreateTagDialogOpen,
    createTagDefaultValues: state.createTagDefaultValues,
    createTagForm: createTagForm(copy),
    isClipFpsDialogOpen: state.isClipFpsDialogOpen,
    clipFpsDialogValues: state.clipFpsDialogValues,
    clipFpsDialogKey: `${state.clipFpsDialogClipName ?? "none"}-${state.clipFpsDialogRevision}`,
    clipFpsForm: buildClipFpsForm(state.clipFpsDialogClipName, copy),
    dialogPreviewUrl: state.dialogPreviewUrl,
    dialogPreviewFileId,
    dialogPreviewKey,
    dialogPreviewAtlas: dialogAtlas,
    dialogPreviewAnimation,
    dialogImageSourcePreviewUrl,
    dialogImageSourceFileId,
    dialogClipOptions: dialogSelection.clipOptions,
    dialogSelectedClipName,
    dialogAtlasSourceLabel: copy.uploadButton ?? "Upload",
    dialogAtlasFieldValue,
    dialogAtlasFieldPlaceholder: dialogHasAtlasSource
      ? (copy.currentSpritesheetJson ?? "Current spritesheet JSON")
      : (copy.noJsonSelected ?? "No JSON selected"),
    isFolderNameDialogOpen: state.isFolderNameDialogOpen,
    folderNameDialogItemId: state.folderNameDialogItemId,
    folderNameForm: createFolderNameForm(copy),
    folderNameDialogDefaultValues: state.folderNameDialogDefaultValues,
    addTagPlaceholder: copy.addTagPlaceholder ?? "Add tag",
    animationsLabel: copy.animationsLabel ?? "Animations",
    clickToUploadLabel: copy.clickToUploadLabel ?? "Click to upload",
    clipsLabel: copy.clipsLabel ?? "Clips",
    deleteButton: copy.deleteButton ?? "Delete",
    dialogInstructions:
      copy.dialogInstructions ??
      "Set the name and description, then select the PNG image and spritesheet JSON here.",
    emptyPreviewLabel: copy.emptyPreviewLabel ?? "No preview available",
    filesLabel: copy.filesLabel ?? "Files",
    noAnimationsFound: copy.noAnimationsFound ?? "No animations found",
    noSelectionLabel: copy.noSelectionLabel ?? "No selection",
    previewButton: copy.previewMenuItem ?? "Preview",
    selectValidJsonToDetectClips:
      copy.selectValidJsonToDetectClips ??
      "Select valid spritesheet JSON to detect clips",
  };
};
