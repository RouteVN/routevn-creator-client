import { formatFileSize } from "../../internal/files.js";
import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";

const EMPTY_TREE = { tree: [], items: {} };

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

export const createInitialState = () => ({
  spritesData: EMPTY_TREE,
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

export const setCharacterId = ({ state }, { characterId } = {}) => {
  state.characterId = characterId;
};

export const setCharacterName = ({ state }, { characterName } = {}) => {
  state.characterName = characterName;
};

export const clearCharacterSpritesView = ({ state }) => {
  state.characterName = undefined;
  state.spritesData = EMPTY_TREE;
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

export const setEditUpload = ({ state }, { uploadResult, previewFileId } = {}) => {
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
  const flatItems = toFlatItems(state.spritesData);
  const rawFlatGroups = toFlatGroups(state.spritesData);
  const searchQuery = state.searchQuery.toLowerCase().trim();

  const mediaGroups = rawFlatGroups
    .map((group) => {
      const children = (group.children ?? []).filter((item) =>
        matchesSearch(item, searchQuery),
      );
      const shouldDisplay = !searchQuery || children.length > 0;

      return {
        ...group,
        children: children.map((item) => ({
          ...item,
          cardKind: "image",
          previewFileId: item.fileId,
          canPreview: true,
        })),
        hasChildren: children.length > 0,
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
      selectedItem?.type === "image" ? selectedItem.fileId : undefined,
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
  };
};
