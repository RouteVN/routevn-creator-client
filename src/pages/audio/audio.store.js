import { toFlatGroups, toFlatItems } from "insieme";
import { formatFileSize } from "../../utils/index.js";

const form = {
  fields: [
    {
      name: "fileId",
      inputType: "waveform",
      waveformData: "${fileId.waveformData}",
      width: 240,
      height: 100,
    },
    { name: "name", inputType: "popover-input", description: "Name" },
    {
      name: "fileType",
      inputType: "read-only-text",
      description: "File Type",
    },
    {
      name: "fileSize",
      inputType: "read-only-text",
      description: "File Size",
    },
    {
      name: "duration",
      inputType: "read-only-text",
      description: "Duration",
    },
  ],
};

export const createInitialState = () => ({
  audioData: { tree: [], items: {} },
  selectedItemId: null,
  context: {
    fileId: {
      waveformData: null,
    },
  },
  searchQuery: "",
  playingAudio: {
    title: "",
    fileId: undefined,
  },
  showAudioPlayer: false,
  audioPlayerLeft: 0,
  audioPlayerRight: 0,
});

export const setContext = (state, context) => {
  state.context = context;
};

export const setItems = (state, audioData) => {
  state.audioData = audioData;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  const flatItems = toFlatItems(state.audioData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
};

export const setSearchQuery = (state, query) => {
  state.searchQuery = query;
};

export const openAudioPlayer = (state, { fileId, fileName }) => {
  state.playingAudio.fileId = fileId;
  state.playingAudio.title = fileName;
  state.showAudioPlayer = true;
};

export const closeAudioPlayer = (state) => {
  state.showAudioPlayer = false;
  state.playingAudio = {
    title: "",
    fileId: undefined,
  };
};

export const updateAudioPlayerLeft = (state, payload) => {
  state.audioPlayerLeft = payload.width + 64;
};

export const updateAudioPlayerRight = (state, payload) => {
  state.audioPlayerRight = payload.width;
};

export const selectAudioPlayerLeft = (state) => {
  return state.audioPlayerLeft;
};

export const selectAudioPlayerRight = (state) => {
  return state.audioPlayerRight;
};

export const selectViewData = ({ state }) => {
  const flatItems = toFlatItems(state.audioData);
  const rawFlatGroups = toFlatGroups(state.audioData);
  const searchQuery = state.searchQuery.toLowerCase();

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

  if (selectedItem) {
    defaultValues = {
      name: selectedItem.name,
      fileType: selectedItem.fileType,
      fileSize: formatFileSize(selectedItem.fileSize),
      duration: selectedItem.duration
        ? `${Math.floor(selectedItem.duration / 60).toString()}:${Math.floor(
            selectedItem.duration % 60,
          )
            .toString()
            .padStart(2, "0")}`
        : "Unknown",
    };
  }

  return {
    flatItems,
    flatGroups,
    resourceCategory: "assets",
    selectedResourceId: "audio",
    selectedItemId: state.selectedItemId,
    repositoryTarget: "audio",
    form,
    context: state.context,
    defaultValues,
    searchQuery: state.searchQuery,
    resourceType: "audio",
    title: "Audio",
    uploadText: "Upload Audio",
    acceptedFileTypes: [".mp3", ".wav", ".ogg"],
    playingAudio: state.playingAudio,
    showAudioPlayer: state.showAudioPlayer,
    audioPlayerLeft: state.audioPlayerLeft,
    audioPlayerRight: state.audioPlayerRight,
  };
};
