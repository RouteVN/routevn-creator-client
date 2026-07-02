import { formatFileSize } from "../../internal/files.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import { createMediaPageStore } from "../../internal/ui/resourcePages/media/createMediaPageStore.js";
import { createTagField } from "../../internal/ui/resourcePages/tags.js";
import { matchesTagAwareSearch } from "../../internal/resourceTags.js";
import { selectSoundsPageCopy } from "./support/soundsPageCopy.js";

const SOUND_TAG_SCOPE_KEY = "sounds";

const formatDuration = (duration, copy) => {
  if (duration === undefined || duration === null) {
    return copy.unknownValue;
  }

  return `${Math.floor(duration / 60).toString()}:${Math.floor(duration % 60)
    .toString()
    .padStart(2, "0")}`;
};

const buildDetailFields = (item, { copy } = {}) => {
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
      label: copy.tagsLabel,
    },
    {
      type: "text",
      label: copy.fileTypeLabel,
      value: item.fileType ?? "",
    },
    {
      type: "text",
      label: copy.fileSizeLabel,
      value: formatFileSize(item.fileSize),
    },
    {
      type: "text",
      label: copy.durationLabel,
      value: formatDuration(item.duration, copy),
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

const createEditForm = ({ copy } = {}) => ({
  title: copy.editTitle,
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
      type: "slot",
      slot: "sound-slot",
      label: copy.soundLabel,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: copy.updateButton,
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
  setSelectedFolderId,
  openEditDialog,
  closeEditDialog,
  openFolderNameDialog,
  closeFolderNameDialog,
  setEditUpload,
  setUiConfig,
  openMobileFileExplorer,
  closeMobileFileExplorer,
  selectSelectedItem,
  selectItemById,
  selectSelectedItemId,
  selectFolderById,
  selectSelectedFolderId,
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
  title: "",
  selectedResourceId: "sounds",
  uploadText: "",
  acceptedFileTypes: [".mp3", ".wav", ".ogg"],
  previewMenuLabel: "",
  matchesSearch: matchesTagAwareSearch,
  buildDetailFields,
  buildMediaItem,
  buildPendingMediaItem,
  createEditForm,
  copy: selectSoundsPageCopy,
  getSelectedPreviewFileId: (item) => item?.waveformDataFileId,
  tagging: {
    tagFilterPlaceholder: "",
  },
  hiddenMobileDetailSlots: ["sound-waveform"],
  extendViewData: ({ state, baseViewData, copy }) => {
    const deleteDialogItem = state.mobileDeleteDialogItemId
      ? state.data?.items?.[state.mobileDeleteDialogItemId]
      : undefined;
    const deleteDialogItemName = deleteDialogItem?.name
      ? `"${deleteDialogItem.name}"`
      : copy.deleteTargetFallback;

    return {
      ...baseViewData,
      playingSound: state.playingSound,
      showAudioPlayer: state.showAudioPlayer,
      audioPlayerLeft: state.isTouchMode ? 0 : state.audioPlayerLeft,
      audioPlayerRight: state.isTouchMode ? 0 : state.audioPlayerRight,
      mobileDeleteDialogOpen: state.mobileDeleteDialogOpen,
      mobileDeleteDialogTitle: copy.deleteTitle,
      mobileDeleteDialogMessage: copy.deleteMessage.replace(
        "{itemName}",
        deleteDialogItemName,
      ),
      mobileDeleteDialogConfirmLabel: copy.deleteButton,
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
  mobileDeleteDialogOpen: false,
  mobileDeleteDialogItemId: undefined,
});

export {
  setBaseItems as setItems,
  addPendingUploads,
  removePendingUploads,
  updatePendingUpload,
  setBaseSelectedItemId as setSelectedItemId,
  setSelectedFolderId,
  openEditDialog,
  closeEditDialog,
  openFolderNameDialog,
  closeFolderNameDialog,
  setEditUpload,
  setUiConfig,
  openMobileFileExplorer,
  closeMobileFileExplorer,
  selectSelectedItem,
  selectFolderById,
  selectSelectedFolderId,
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

export const openMobileDeleteDialog = ({ state }, { itemId } = {}) => {
  if (!itemId) {
    return;
  }

  state.mobileDeleteDialogOpen = true;
  state.mobileDeleteDialogItemId = itemId;
};

export const closeMobileDeleteDialog = ({ state }) => {
  state.mobileDeleteDialogOpen = false;
  state.mobileDeleteDialogItemId = undefined;
};

export const selectMobileDeleteDialogItemId = ({ state }) =>
  state.mobileDeleteDialogItemId;

export const selectViewData = (context) => {
  const viewData = selectMediaViewData(context);

  return {
    ...viewData,
    flatItems: applyFolderRequiredRootDragOptions(viewData.flatItems),
  };
};

export { SOUND_TAG_SCOPE_KEY };
