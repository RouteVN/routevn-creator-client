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
  { label: "Preview", type: "item", value: "preview-item" },
  { label: "Delete", type: "item", value: "delete-item" },
];

const buildDetailFields = (item) => {
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

const getPreviewFileId = (item) => item?.thumbnailFileId ?? item?.fileId;

const createEditForm = () => ({
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

const matchesSearch = (item, searchQuery) => {
  if (!searchQuery) {
    return true;
  }

  const name = (item.name ?? "").toLowerCase();
  const description = (item.description ?? "").toLowerCase();

  return name.includes(searchQuery) || description.includes(searchQuery);
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

export const createInitialState = () => ({
  spritesData: EMPTY_TREE,
  pendingUploads: [],
  selectedItemId: undefined,
  characterId: undefined,
  characterName: undefined,
  searchQuery: "",
  fullImagePreviewVisible: false,
  fullImagePreviewFileId: undefined,
  isEditDialogOpen: false,
  editItemId: undefined,
  editDefaultValues: {
    name: "",
    description: "",
  },
  editPreviewFileId: undefined,
  editUploadResult: undefined,
});

export const setItems = ({ state }, { spritesData } = {}) => {
  state.spritesData = spritesData ?? EMPTY_TREE;
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

export const setCharacterId = ({ state }, { characterId } = {}) => {
  state.characterId = characterId;
};

export const setCharacterName = ({ state }, { characterName } = {}) => {
  state.characterName = characterName;
};

export const clearCharacterSpritesView = ({ state }) => {
  state.characterName = undefined;
  state.spritesData = EMPTY_TREE;
  state.pendingUploads = [];
  state.selectedItemId = undefined;
  state.isEditDialogOpen = false;
  state.editItemId = undefined;
  state.editDefaultValues = {
    name: "",
    description: "",
  };
  state.editPreviewFileId = undefined;
  state.editUploadResult = undefined;
};

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  state.selectedItemId = itemId;
};

export const setSearchQuery = ({ state }, { query } = {}) => {
  state.searchQuery = query ?? "";
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
  };
  state.editPreviewFileId = undefined;
  state.editUploadResult = undefined;
};

export const setEditUpload = (
  { state },
  { uploadResult, previewFileId } = {},
) => {
  state.editUploadResult = uploadResult;
  state.editPreviewFileId = previewFileId;
};

export const selectSelectedItem = ({ state }) => {
  const item = state.spritesData.items?.[state.selectedItemId];
  return item?.type === "image" ? item : undefined;
};

export const selectSpriteItemById = ({ state }, { itemId } = {}) => {
  const item = state.spritesData.items?.[itemId];
  return item?.type === "image" ? item : undefined;
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
};

export const selectCharacterId = ({ state }) => {
  return state.characterId;
};

export const showFullImagePreview = ({ state }, { itemId } = {}) => {
  const item = state.spritesData.items?.[itemId];

  if (item?.fileId) {
    state.fullImagePreviewVisible = true;
    state.fullImagePreviewFileId = item.fileId;
  }
};

export const hideFullImagePreview = ({ state }, _payload = {}) => {
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewFileId = undefined;
};

export const selectViewData = ({ state }) => {
  const flatItems = applyFolderRequiredRootDragOptions(
    toFlatItems(state.spritesData),
  );
  const rawFlatGroups = toFlatGroups(state.spritesData);
  const searchQuery = state.searchQuery.toLowerCase().trim();
  const pendingByGroupId = new Map();

  for (const pendingUpload of state.pendingUploads ?? []) {
    const groupId = pendingUpload?.parentId;
    if (!groupId) {
      continue;
    }

    const existing = pendingByGroupId.get(groupId) ?? [];
    existing.push(buildPendingMediaItem(pendingUpload));
    pendingByGroupId.set(groupId, existing);
  }

  const mediaGroups = rawFlatGroups
    .map((group) => {
      const children = (group.children ?? [])
        .filter((item) => matchesSearch(item, searchQuery))
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

  const selectedItem = state.spritesData.items?.[state.selectedItemId];

  return {
    flatItems,
    mediaGroups,
    resourceCategory: "assets",
    selectedResourceId: "characters",
    selectedItemId: state.selectedItemId,
    selectedItemName: selectedItem?.name ?? "",
    detailFields:
      selectedItem?.type === "image" ? buildDetailFields(selectedItem) : [],
    selectedPreviewFileId:
      selectedItem?.type === "image"
        ? getPreviewFileId(selectedItem)
        : undefined,
    searchQuery: state.searchQuery,
    uploadText: "Upload Sprite",
    acceptedFileTypes: [".jpg", ".jpeg", ".png", ".webp"],
    fullImagePreviewVisible: state.fullImagePreviewVisible,
    fullImagePreviewFileId: state.fullImagePreviewFileId,
    folderContextMenuItems,
    itemContextMenuItems,
    emptyContextMenuItems,
    centerItemContextMenuItems,
    title: state.characterName,
    isEditDialogOpen: state.isEditDialogOpen,
    editForm: createEditForm(),
    editDefaultValues: state.editDefaultValues,
    editPreviewFileId: state.editPreviewFileId,
    startCollapsedFileExplorer: shouldStartCollapsedFileExplorer({
      flatItems,
      threshold: AUTO_COLLAPSE_FILE_EXPLORER_ITEM_THRESHOLD,
    }),
  };
};
