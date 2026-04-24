import { formatFileSize } from "../../internal/files.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";
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
import {
  buildMobileResourcePageViewData,
  closeMobileResourceFileExplorerState,
  createMobileResourcePageState,
  openMobileResourceFileExplorerState,
  setMobileResourcePageUiConfigState,
} from "../../internal/ui/resourcePages/mobileResourcePage.js";

const EMPTY_TREE = { tree: [], items: {} };
export const SPRITESHEET_TAG_SCOPE_KEY = "spritesheets";
const AUTO_COLLAPSE_FILE_EXPLORER_ITEM_THRESHOLD =
  DEFAULT_FILE_EXPLORER_AUTO_COLLAPSE_THRESHOLD;
const CREATE_TAG_DEFAULT_VALUES = Object.freeze({
  name: "",
});

const createTagForm = {
  title: "Create Tag",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: "Tag Name",
      required: true,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: "Create Tag",
      },
    ],
  },
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
  { label: "Delete", type: "item", value: "delete-item" },
];

const dialogForm = {
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
      label: "Atlas JSON",
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

const buildDialogForm = (submitLabel) => ({
  ...dialogForm,
  actions: {
    ...dialogForm.actions,
    buttons: dialogForm.actions.buttons.map((button) => ({
      ...button,
      label: button.id === "submit" ? submitLabel : button.label,
    })),
  },
});

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

const buildClipOptions = (animations = {}, selectedClipName) => {
  const clipOptions = Object.entries(animations ?? {}).map(
    ([name, animation]) => ({
      name,
      frameCount: animation?.frames?.length ?? 0,
      fps: Math.round(Number(animation?.animationSpeed ?? 0.5) * 60),
      loop: animation?.loop ?? true,
      isSelected: name === selectedClipName,
    }),
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

const buildDetailFields = (item) => {
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

const selectDataItem = (state, itemId) => {
  const item = state.data?.items?.[itemId];
  return item?.type === "spritesheet" ? item : undefined;
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

export const createInitialState = () => ({
  data: EMPTY_TREE,
  tagsData: createEmptyTagCollection(),
  activeTagIds: [],
  detailTagIds: [],
  detailTagIdsDirty: false,
  isDetailTagSelectOpen: false,
  selectedItemId: undefined,
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
  dialogSourceFiles: createDialogSourceFiles(),
  dialogSelectedClipName: undefined,
  dialogRevision: 0,
});

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
  syncDetailTagIds(state, { preserveDirty: true });
};

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  state.selectedItemId = itemId;
  state.detailSelectedClipName = undefined;
  state.isDetailTagSelectOpen = false;
  syncDetailTagIds(state);
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
  state.dialogPreviewUrl = previewUrl;
  state.dialogSourceFiles = {
    ...createDialogSourceFiles(),
    ...sourceFiles,
  };
  state.dialogSelectedClipName = undefined;
  state.dialogRevision += 1;
};

export const openEditDialog = (
  { state },
  { itemId, values, previewUrl, sourceFiles } = {},
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
  state.dialogPreviewUrl = previewUrl;
  state.dialogSourceFiles = {
    ...createDialogSourceFiles(),
    ...sourceFiles,
  };
  state.dialogSelectedClipName = undefined;
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
  state.dialogPreviewUrl = previewUrl;
  state.dialogSourceFiles = createDialogSourceFiles();
  state.dialogSelectedClipName = undefined;
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
  state.dialogSourceFiles = createDialogSourceFiles();
  state.dialogSelectedClipName = undefined;
  state.dialogRevision += 1;
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
  state.dialogRevision += 1;
};

export const setDialogSelectedClipName = ({ state }, { clipName } = {}) => {
  state.dialogSelectedClipName = clipName;
};

export const selectSelectedItem = ({ state }) =>
  selectDataItem(state, state.selectedItemId);

export const selectItemById = ({ state }, { itemId } = {}) =>
  selectDataItem(state, itemId);

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const selectDialogMode = ({ state }) => state.dialogMode;

export const selectDialogItemId = ({ state }) => state.dialogItemId;

export const selectDialogParentId = ({ state }) => state.dialogParentId;

export const selectDialogImportData = ({ state }) => state.dialogImportData;

export const selectDialogSourceFiles = ({ state }) => state.dialogSourceFiles;

export const selectDialogValues = ({ state }) => state.dialogValues;

export const selectDialogPreviewUrl = ({ state }) => state.dialogPreviewUrl;

export const selectViewData = ({ state }) => {
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
  const detailSelection = buildClipOptions(
    selectedItem?.animations,
    state.detailSelectedClipName,
  );
  const detailSelectedClipName = detailSelection.selectedClipName;
  const detailPreviewAnimation =
    selectedItem?.animations?.[detailSelectedClipName];

  const dialogBaseItem = selectDataItem(state, state.dialogItemId);
  const dialogAnimations =
    state.dialogImportData?.animations ?? dialogBaseItem?.animations ?? {};
  const dialogSelection = buildClipOptions(
    dialogAnimations,
    state.dialogSelectedClipName,
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
  const detailPreviewKey = `${state.selectedItemId ?? "empty"}-${detailSelectedClipName ?? "default"}`;
  const dialogPreviewSourceKey =
    state.dialogPreviewUrl ?? dialogPreviewFileId ?? "empty";
  const dialogPreviewKey = `${state.dialogRevision}-${dialogSelectedClipName ?? "default"}-${dialogPreviewSourceKey}`;
  const dialogHasAtlasSource = Boolean(
    state.dialogSourceFiles?.atlasFile || dialogBaseItem?.jsonData,
  );
  const dialogAtlasFieldValue = state.dialogSourceFiles?.atlasFile?.name ?? "";
  const isDialogPreviewMode = state.dialogMode === "preview";
  const detailFields = buildDetailFields(selectedItem);
  return {
    resourceCategory: "animatedAssets",
    selectedResourceId: "spritesheets",
    title: "Spritesheets",
    uploadText: "Add",
    uploadIcon: "plus",
    acceptedFileTypes: [".png", ".json"],
    flatItems,
    mediaGroups,
    tagFilterOptions: buildTagFilterOptions({
      tagsCollection: state.tagsData,
    }),
    selectedTagFilterValues: activeTagIds,
    tagFilterPlaceholder: "Filter tags",
    selectedItemId: state.selectedItemId,
    selectedItemName: selectedItem?.name ?? "",
    selectedItemTagIds: selectedItem?.tagIds ?? [],
    detailTagDraftValues: state.detailTagIds ?? [],
    isDetailTagSelectOpen: !!state.isDetailTagSelectOpen,
    detailTagAddOption: {
      label: "Add tag",
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
    searchPlaceholder: "Search...",
    folderContextMenuItems,
    itemContextMenuItems,
    emptyContextMenuItems,
    centerItemContextMenuItems,
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
    detailPreviewPaused: state.isDialogOpen && isDialogPreviewMode,
    isDialogOpen: state.isDialogOpen,
    isDialogPreviewMode,
    dialogMode: state.dialogMode,
    dialogTitle:
      state.dialogMode === "create"
        ? "Add Spritesheet"
        : state.dialogMode === "edit"
          ? "Edit Spritesheet"
          : "Preview Spritesheet",
    dialogSubmitLabel:
      state.dialogMode === "create" ? "Add Spritesheet" : "Update Spritesheet",
    dialogForm: buildDialogForm(
      state.dialogMode === "create" ? "Add Spritesheet" : "Update Spritesheet",
    ),
    dialogFormKey: `${state.dialogMode}-${state.dialogItemId ?? "new"}-${state.dialogRevision}`,
    dialogValues: state.dialogValues,
    isCreateTagDialogOpen: state.isCreateTagDialogOpen,
    createTagDefaultValues: state.createTagDefaultValues,
    createTagForm,
    dialogPreviewUrl: state.dialogPreviewUrl,
    dialogPreviewFileId,
    dialogPreviewKey,
    dialogPreviewAtlas: dialogAtlas,
    dialogPreviewAnimation,
    dialogImageSourcePreviewUrl,
    dialogImageSourceFileId,
    dialogClipOptions: dialogSelection.clipOptions,
    dialogSelectedClipName,
    dialogAtlasSourceLabel: dialogHasAtlasSource
      ? "Replace JSON"
      : "Upload JSON",
    dialogAtlasFieldValue,
    dialogAtlasFieldPlaceholder: dialogHasAtlasSource
      ? "Current atlas"
      : "No JSON selected",
  };
};
