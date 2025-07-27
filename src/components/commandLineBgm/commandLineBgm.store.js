import { toFlatGroups, toFlatItems } from "../../deps/repository";
import { formatFileSize } from "../../utils/index.js";

const createBgmForm = () => {
  const form = {
    fields: [
      {
        name: "audio",
        label: "Background Music",
        required: true,
        inputType: "waveform",
        width: 355,
        height: 200,
      },
      {
        name: "loopType",
        label: "Loop Type",
        inputType: "select",
        options: [
          { label: "No Loop", value: "none" },
          { label: "Loop Once", value: "once" },
          { label: "Loop Forever", value: "forever" },
          { label: "Fade In/Out", value: "fade" },
        ],
      },
    ],
  };
  return form;
};

export const INITIAL_STATE = Object.freeze({
  mode: "current",
  items: [],
  selectedAudioId: undefined,
  selectedFileId: undefined,
  tempSelectedAudioId: undefined,
  fieldResources: {
    audio: {
      fileId: undefined,
    },
  },
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

export const setFieldResources = (state, resources) => {
  state.fieldResources = resources;
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
          selectedStyle: isSelected
            ? "outline: 2px solid var(--color-pr); outline-offset: 2px;"
            : "",
          waveformDataFileId: child.waveformDataFileId,
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

  let breadcrumb = [
    {
      id: "actions",
      label: "Actions",
    },
  ];

  if (state.mode === "gallery") {
    breadcrumb.push({
      id: "current",
      label: "BGM",
    });
    breadcrumb.push({
      label: "Select",
    });
  } else {
    breadcrumb.push({
      label: "BGM",
    });
  }

  // Get default values for form
  const defaultValues = {
    audio: state.selectedFileId,
    loopType: props?.line?.presentation?.bgm?.loopType || "none",
  };

  return {
    mode: state.mode,
    items: flatItems,
    groups: flatGroups,
    loopOptions,
    selectedAudioId: state.selectedAudioId,
    selectedFileId: state.selectedFileId,
    selectedAudioName,
    breadcrumb,
    form: createBgmForm(),
    defaultValues,
    fieldResources: state.fieldResources,
  };
};
