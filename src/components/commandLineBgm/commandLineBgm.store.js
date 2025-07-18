import { toFlatGroups, toFlatItems } from "../../deps/repository";

export const INITIAL_STATE = Object.freeze({
  mode: "current",
  items: [],
  selectedAudioId: undefined,
  selectedFileId: undefined,
  tempSelectedAudioId: undefined,
});

export const setMode = (state, payload) => {
  state.mode = payload.mode;
};

export const setItems = (state, payload) => {
  state.items = payload.items;
};

export const selectSelectedAudioId = ({ state }) => {
  return state.selectedAudioId;
};

export const selectTempSelectedAudioId = ({ state }) => {
  return state.tempSelectedAudioId;
};

export const setSelectedAudioAndFileId = (state, payload) => {
  state.selectedAudioId = payload.audioId;
  state.selectedFileId = payload.fileId;
};

export const setTempSelectedAudioId = (state, payload) => {
  state.tempSelectedAudioId = payload.audioId;
};

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.items).filter(
    (item) => item.type === "folder",
  );
  const flatGroups = toFlatGroups(state.items).map((group) => {
    return {
      ...group,
      children: group.children.map((child) => {
        const isSelected = child.id === state.tempSelectedAudioId;
        return {
          ...child,
          bw: isSelected ? "md" : "",
        };
      }),
    };
  });

  const loopOptions = [
    { label: "No Loop", value: "none" },
    { label: "Loop Once", value: "once" },
    { label: "Loop Forever", value: "forever" },
    { label: "Fade In/Out", value: "fade" },
  ];

  // Get selected audio name
  const selectedAudioName = state.selectedAudioId
    ? toFlatItems(state.items).find((item) => item.id === state.selectedAudioId)
        ?.name
    : undefined;

  return {
    mode: state.mode,
    items: flatItems,
    groups: flatGroups,
    loopOptions,
    selectedAudioId: state.selectedAudioId,
    selectedFileId: state.selectedFileId,
    selectedAudioName,
  };
};
