import { toFlatGroups, toFlatItems } from "#domain-structure";
import { formatFileSize } from "../../utils/index.js";

const form = {
  fields: [
    {
      name: "fileId",
      type: "waveform",
      waveformData: "${fileId.waveformData}",
      width: 240,
      height: 100,
    },
    { name: "name", type: "popover-input", label: "Name" },
    {
      name: "fileType",
      type: "read-only-text",
      label: "File Type",
      content: "${fileType}",
    },
    {
      name: "fileSize",
      type: "read-only-text",
      label: "File Size",
      content: "${fileSize}",
    },
    {
      name: "duration",
      type: "read-only-text",
      label: "Duration",
      content: "${duration}",
    },
  ],
};

export const createInitialState = () => ({
  soundData: { tree: [], items: {} },
  selectedItemId: null,
  context: {
    fileId: {
      waveformData: null,
    },
    fileType: "",
    fileSize: "",
    duration: "",
  },
  searchQuery: "",
  playingSound: {
    title: "",
    fileId: undefined,
  },
  showAudioPlayer: false,
  audioPlayerLeft: 0,
  audioPlayerRight: 0,
});

export const setContext = ({ state }, { context } = {}) => {
  state.context = context;
};

export const setItems = ({ state }, { soundData } = {}) => {
  state.soundData = soundData;
};

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  state.selectedItemId = itemId;
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  const flatItems = toFlatItems(state.soundData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
};

export const setSearchQuery = ({ state }, { query } = {}) => {
  state.searchQuery = query;
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

export const selectViewData = ({ state }) => {
  const flatItems = toFlatItems(state.soundData);
  const rawFlatGroups = toFlatGroups(state.soundData);
  const searchQuery = (state.searchQuery || "").toLowerCase();

  // Helper function to check if an item matches the search query
  const matchesSearch = (item) => {
    if (!searchQuery) return true;

    const name = (item.name || "").toLowerCase();
    const description = (item.description || "").toLowerCase();

    return name.includes(searchQuery) || description.includes(searchQuery);
  };

  // Apply collapsed state and search filtering to flatGroups
  const flatGroups = rawFlatGroups
    .map((group) => {
      // Filter children based on search query
      const filteredChildren = (group.children || []).filter(matchesSearch);

      // Only show groups that have matching children or if there's no search query
      const hasMatchingChildren = filteredChildren.length > 0;
      const shouldShowGroup = !searchQuery || hasMatchingChildren;

      return {
        ...group,
        children: filteredChildren.map((item) => ({
          ...item,
          selectedStyle:
            item.id === state.selectedItemId
              ? "outline: 2px solid var(--color-pr); outline-offset: 2px;"
              : "",
        })),
        hasChildren: filteredChildren.length > 0,
        shouldDisplay: shouldShowGroup,
      };
    })
    .filter((group) => group.shouldDisplay);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  // Transform selectedItem into form defaults
  let defaultValues = {};
  let formContext = {
    ...state.context,
    fileType: "",
    fileSize: "",
    duration: "",
  };

  if (selectedItem) {
    const formattedFileSize = formatFileSize(selectedItem.fileSize);
    const formattedDuration = selectedItem.duration
      ? `${Math.floor(selectedItem.duration / 60).toString()}:${Math.floor(
          selectedItem.duration % 60,
        )
          .toString()
          .padStart(2, "0")}`
      : "Unknown";
    const fileType = selectedItem.fileType || "";

    defaultValues = {
      name: selectedItem.name,
      fileType,
      fileSize: formattedFileSize,
      duration: formattedDuration,
    };

    formContext = {
      ...state.context,
      fileType,
      fileSize: formattedFileSize,
      duration: formattedDuration,
    };
  }

  return {
    flatItems,
    flatGroups,
    resourceCategory: "assets",
    selectedResourceId: "sounds",
    selectedItemId: state.selectedItemId,
    repositoryTarget: "sounds",
    form,
    context: formContext,
    defaultValues,
    searchQuery: state.searchQuery,
    resourceType: "sounds",
    title: "Sound",
    uploadText: "Upload Sound",
    acceptedFileTypes: [".mp3", ".wav", ".ogg"],
    playingSound: state.playingSound,
    showAudioPlayer: state.showAudioPlayer,
    audioPlayerLeft: state.audioPlayerLeft,
    audioPlayerRight: state.audioPlayerRight,
  };
};
