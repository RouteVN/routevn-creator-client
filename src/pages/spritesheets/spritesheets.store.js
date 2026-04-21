import { formatFileSize } from "../../internal/files.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";
import {
  DEFAULT_FILE_EXPLORER_AUTO_COLLAPSE_THRESHOLD,
  shouldStartCollapsedFileExplorer,
} from "../../internal/ui/resourcePages/media/mediaPageShared.js";

const EMPTY_TREE = { tree: [], items: {} };
const AUTO_COLLAPSE_FILE_EXPLORER_ITEM_THRESHOLD =
  DEFAULT_FILE_EXPLORER_AUTO_COLLAPSE_THRESHOLD;

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

const matchesSearch = (item, searchQuery) => {
  if (!searchQuery) {
    return true;
  }

  const name = (item.name ?? "").toLowerCase();
  const description = (item.description ?? "").toLowerCase();
  return name.includes(searchQuery) || description.includes(searchQuery);
};

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
  width: item?.width ?? "",
  height: item?.height ?? "",
});

const createDialogSourceFiles = () => ({
  pngFile: undefined,
  atlasFile: undefined,
});

export const createInitialState = () => ({
  data: EMPTY_TREE,
  selectedItemId: undefined,
  searchQuery: "",
  detailSelectedClipName: undefined,
  isDialogOpen: false,
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

export const setItems = ({ state }, { data } = {}) => {
  state.data = data ?? EMPTY_TREE;
};

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  state.selectedItemId = itemId;
  state.detailSelectedClipName = undefined;
};

export const setSearchQuery = ({ state }, { value } = {}) => {
  state.searchQuery = value ?? "";
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
  const mediaGroups = buildMediaGroups(state);
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
  const dialogPreviewFileId = state.dialogPreviewUrl
    ? undefined
    : dialogBaseItem?.fileId;
  const detailPreviewKey = `${state.selectedItemId ?? "empty"}-${detailSelectedClipName ?? "default"}`;
  const dialogPreviewSourceKey =
    state.dialogPreviewUrl ?? dialogPreviewFileId ?? "empty";
  const dialogPreviewKey = `${state.dialogRevision}-${dialogSelectedClipName ?? "default"}-${dialogPreviewSourceKey}`;
  const dialogHasImageSource = Boolean(
    state.dialogSourceFiles?.pngFile || dialogBaseItem?.fileId,
  );
  const dialogHasAtlasSource = Boolean(
    state.dialogSourceFiles?.atlasFile || dialogBaseItem?.jsonData,
  );
  const dialogImageFieldValue = state.dialogSourceFiles?.pngFile?.name ?? "";
  const dialogAtlasFieldValue = state.dialogSourceFiles?.atlasFile?.name ?? "";
  const isDialogPreviewMode = state.dialogMode === "preview";
  return {
    resourceCategory: "animatedAssets",
    selectedResourceId: "spritesheets",
    title: "Spritesheets",
    uploadText: "Add",
    uploadIcon: "plus",
    acceptedFileTypes: [".png", ".json"],
    flatItems,
    mediaGroups,
    selectedItemId: state.selectedItemId,
    selectedItemName: selectedItem?.name ?? "",
    detailFields: buildDetailFields(selectedItem),
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
    dialogPreviewUrl: state.dialogPreviewUrl,
    dialogPreviewFileId,
    dialogPreviewKey,
    dialogPreviewAtlas: dialogAtlas,
    dialogPreviewAnimation,
    dialogClipOptions: dialogSelection.clipOptions,
    dialogSelectedClipName,
    dialogImageSourceLabel: dialogHasImageSource
      ? "Replace Image"
      : "Upload Image",
    dialogAtlasSourceLabel: dialogHasAtlasSource
      ? "Replace JSON"
      : "Upload JSON",
    dialogImageFieldValue,
    dialogAtlasFieldValue,
    dialogImageFieldPlaceholder: dialogHasImageSource
      ? "Current image"
      : "No image selected",
    dialogAtlasFieldPlaceholder: dialogHasAtlasSource
      ? "Current atlas"
      : "No JSON selected",
  };
};
