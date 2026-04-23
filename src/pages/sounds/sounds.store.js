import { formatFileSize } from "../../internal/files.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import { createMediaPageStore } from "../../internal/ui/resourcePages/media/createMediaPageStore.js";
import { createTagField } from "../../internal/ui/resourcePages/tags.js";
import { matchesTagAwareSearch } from "../../internal/resourceTags.js";

const SOUND_TAG_SCOPE_KEY = "sounds";

const formatDuration = (duration) => {
  if (duration === undefined || duration === null) {
    return "Unknown";
  }

  return `${Math.floor(duration / 60).toString()}:${Math.floor(duration % 60)
    .toString()
    .padStart(2, "0")}`;
};

const buildDetailFields = (item) => {
  if (!item) {
    return [];
  }

  return [
    {
      type: "slot",
      slot: "sound-waveform",
      label: "",
    },
    {
      type: "description",
      value: item.description ?? "",
    },
    {
      type: "slot",
      slot: "sound-tags",
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
      label: "Duration",
      value: formatDuration(item.duration),
    },
  ];
};

const buildMediaItem = (item) => ({
  id: item.id,
  name: item.name,
  cardKind: "sound",
  waveformDataFileId: item.waveformDataFileId,
  canPreview: false,
});

const buildPendingMediaItem = (item) => ({
  id: item.id,
  name: item.name,
  cardKind: "sound",
  isProcessing: true,
  isInteractive: false,
  canPreview: false,
});

const createEditForm = () => ({
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
    createTagField(),
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
});

const {
  createInitialState: createMediaInitialState,
  setItems: setBaseItems,
  addPendingUploads,
  removePendingUploads,
  updatePendingUpload,
  setSelectedItemId: setBaseSelectedItemId,
  openEditDialog,
  closeEditDialog,
  setEditUpload,
  selectSelectedItem,
  selectItemById,
  selectSelectedItemId,
  setSearchQuery,
  setTagsData,
  setActiveTagIds,
  setDetailTagIds,
  commitDetailTagIds,
  setDetailTagPopoverOpen,
  openCreateTagDialog,
  closeCreateTagDialog,
  selectViewData: selectMediaViewData,
} = createMediaPageStore({
  itemType: "sound",
  resourceType: "sounds",
  title: "Sounds",
  selectedResourceId: "sounds",
  uploadText: "Upload",
  acceptedFileTypes: [".mp3", ".wav", ".ogg"],
  previewMenuLabel: "Play",
  matchesSearch: matchesTagAwareSearch,
  buildDetailFields,
  buildMediaItem,
  buildPendingMediaItem,
  createEditForm,
  getSelectedPreviewFileId: (item) => item?.waveformDataFileId,
  tagging: {
    tagFilterPlaceholder: "Filter tags",
  },
  extendViewData: ({ state, baseViewData }) => {
    return {
      ...baseViewData,
      playingSound: state.playingSound,
      showAudioPlayer: state.showAudioPlayer,
      audioPlayerLeft: state.audioPlayerLeft,
      audioPlayerRight: state.audioPlayerRight,
    };
  },
});

export const createInitialState = () => ({
  ...createMediaInitialState(),
  playingSound: {
    title: "",
    fileId: undefined,
  },
  showAudioPlayer: false,
  audioPlayerLeft: 0,
  audioPlayerRight: 0,
});

export {
  setBaseItems as setItems,
  addPendingUploads,
  removePendingUploads,
  updatePendingUpload,
  setBaseSelectedItemId as setSelectedItemId,
  openEditDialog,
  closeEditDialog,
  setEditUpload,
  selectSelectedItem,
  setTagsData,
  setActiveTagIds,
  setDetailTagIds,
  commitDetailTagIds,
  setDetailTagPopoverOpen,
  openCreateTagDialog,
  closeCreateTagDialog,
  selectSelectedItemId,
  setSearchQuery,
};

export const selectSoundItemById = selectItemById;

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

export const selectViewData = (context) => {
  const viewData = selectMediaViewData(context);

  return {
    ...viewData,
    flatItems: applyFolderRequiredRootDragOptions(viewData.flatItems),
  };
};

export { SOUND_TAG_SCOPE_KEY };
