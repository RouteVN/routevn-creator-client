import { toFlatGroups, toFlatItems } from "../../domain/treeHelpers.js";
import { formatFileSize } from "../../utils/index.js";

const folderContextMenuItems = [
  { label: "New Folder", type: "item", value: "new-child-folder" },
  { label: "Duplicate", type: "item", value: "duplicate-item" },
  { label: "Rename", type: "item", value: "rename-item" },
  { label: "Delete", type: "item", value: "delete-item" },
];

const itemContextMenuItems = [
  { label: "Duplicate", type: "item", value: "duplicate-item" },
  { label: "Rename", type: "item", value: "rename-item" },
  { label: "Delete", type: "item", value: "delete-item" },
];

const emptyContextMenuItems = [
  { label: "New Folder", type: "item", value: "new-item" },
];

const formatDuration = (duration) => {
  if (duration === undefined || duration === null) {
    return "Unknown";
  }

  return `${Math.floor(duration / 60).toString()}:${Math.floor(duration % 60)
    .toString()
    .padStart(2, "0")}`;
};

export const createInitialState = () => ({
  soundData: { tree: [], items: {} },
  selectedItemId: undefined,
  searchQuery: "",
  isEditDialogOpen: false,
  editItemId: undefined,
  editDefaultValues: {
    name: "",
    description: "",
  },
  editWaveformDataFileId: undefined,
  editSoundUploadResult: undefined,
  playingSound: {
    title: "",
    fileId: undefined,
  },
  showAudioPlayer: false,
  audioPlayerLeft: 0,
  audioPlayerRight: 0,
});

export const setItems = ({ state }, { soundData } = {}) => {
  state.soundData = soundData;
};

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  state.selectedItemId = itemId;
};

export const setSearchQuery = ({ state }, { value } = {}) => {
  state.searchQuery = value ?? "";
};

export const openEditDialog = (
  { state },
  { itemId, defaultValues, waveformDataFileId } = {},
) => {
  state.isEditDialogOpen = true;
  state.editItemId = itemId;
  state.editDefaultValues = {
    name: defaultValues?.name ?? "",
    description: defaultValues?.description ?? "",
  };
  state.editWaveformDataFileId = waveformDataFileId;
  state.editSoundUploadResult = undefined;
};

export const closeEditDialog = ({ state }, _payload = {}) => {
  state.isEditDialogOpen = false;
  state.editItemId = undefined;
  state.editDefaultValues = {
    name: "",
    description: "",
  };
  state.editWaveformDataFileId = undefined;
  state.editSoundUploadResult = undefined;
};

export const setEditSoundUpload = ({ state }, { uploadResult } = {}) => {
  state.editSoundUploadResult = uploadResult;
  state.editWaveformDataFileId = uploadResult?.waveformDataFileId;
};

export const openAudioPlayer = ({ state }, { fileId, fileName } = {}) => {
  state.playingSound.fileId = fileId;
  state.playingSound.title = fileName;
  state.showAudioPlayer = true;
};

export const closeAudioPlayer = ({ state }, _payload = {}) => {
  state.showAudioPlayer = false;
  state.playingSound = {
    title: "",
    fileId: undefined,
  };
};

const resolveAudioPlayerWidth = (input = {}) => {
  const widthValue = input?.payload?.width ?? input?.width;
  const parsedWidth =
    typeof widthValue === "number" ? widthValue : Number(widthValue);
  return Number.isFinite(parsedWidth) ? parsedWidth : 0;
};

export const updateAudioPlayerLeft = ({ state }, payload = {}) => {
  state.audioPlayerLeft = resolveAudioPlayerWidth(payload) + 64;
};

export const updateAudioPlayerRight = ({ state }, payload = {}) => {
  state.audioPlayerRight = resolveAudioPlayerWidth(payload);
};

export const selectAudioPlayerLeft = ({ state }) => {
  return state.audioPlayerLeft;
};

export const selectAudioPlayerRight = ({ state }) => {
  return state.audioPlayerRight;
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) {
    return undefined;
  }

  const flatItems = toFlatItems(state.soundData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSoundItemById = ({ state }, { itemId } = {}) => {
  const item = state.soundData?.items?.[itemId];
  return item?.type === "sound" ? item : undefined;
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
};

export const selectViewData = ({ state }) => {
  const flatItems = toFlatItems(state.soundData);
  const rawFlatGroups = toFlatGroups(state.soundData);
  const searchQuery = (state.searchQuery ?? "").toLowerCase();

  const matchesSearch = (item) => {
    if (!searchQuery) {
      return true;
    }

    const name = (item.name ?? "").toLowerCase();
    const description = (item.description ?? "").toLowerCase();

    return name.includes(searchQuery) || description.includes(searchQuery);
  };

  const flatGroups = rawFlatGroups
    .map((group) => {
      const filteredChildren = (group.children ?? []).filter(matchesSearch);
      const hasMatchingChildren = filteredChildren.length > 0;
      const shouldShowGroup = !searchQuery || hasMatchingChildren;

      return {
        ...group,
        children: filteredChildren,
        hasChildren: filteredChildren.length > 0,
        shouldDisplay: shouldShowGroup,
      };
    })
    .filter((group) => group.shouldDisplay);

  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : undefined;

  const detailFields = selectedItem
    ? [
        {
          type: "slot",
          slot: "sound-waveform",
          label: "",
        },
        {
          type: "description",
          value: selectedItem.description ?? "",
        },
        {
          type: "text",
          label: "File Type",
          value: selectedItem.fileType ?? "",
        },
        {
          type: "text",
          label: "File Size",
          value: formatFileSize(selectedItem.fileSize),
        },
        {
          type: "text",
          label: "Duration",
          value: formatDuration(selectedItem.duration),
        },
      ]
    : [];

  const editForm = {
    title: "Edit Sound",
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
        slot: "sound-slot",
        label: "Sound",
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "submit",
          variant: "pr",
          label: "Update Sound",
        },
      ],
    },
  };

  return {
    flatItems,
    flatGroups,
    resourceCategory: "assets",
    selectedResourceId: "sounds",
    selectedItemId: state.selectedItemId,
    selectedItemName: selectedItem?.name ?? "",
    detailFields,
    searchQuery: state.searchQuery,
    resourceType: "sounds",
    title: "Sound",
    uploadText: "Upload Sound",
    acceptedFileTypes: [".mp3", ".wav", ".ogg"],
    folderContextMenuItems,
    itemContextMenuItems,
    emptyContextMenuItems,
    selectedSoundWaveformDataFileId: selectedItem?.waveformDataFileId,
    isEditDialogOpen: state.isEditDialogOpen,
    editItemId: state.editItemId,
    editForm,
    editDefaultValues: state.editDefaultValues,
    editWaveformDataFileId: state.editWaveformDataFileId,
    playingSound: state.playingSound,
    showAudioPlayer: state.showAudioPlayer,
    audioPlayerLeft: state.audioPlayerLeft,
    audioPlayerRight: state.audioPlayerRight,
  };
};
