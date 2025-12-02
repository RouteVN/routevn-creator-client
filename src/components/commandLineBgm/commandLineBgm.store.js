import { toFlatGroups, toFlatItems } from "insieme";

const form = {
  fields: [
    {
      inputType: "slot",
      slot: "audio",
      description: "Background Music",
    },
    {
      name: "loop",
      description: "Loop",
      inputType: "select",
      options: [
        { value: true, label: "Loop" },
        { value: false, label: "Don't Loop" },
      ],
    },
    {
      name: "volume",
      description: "Volume",
      inputType: "slider-input",
      min: 0,
      max: 1000,
      step: 1,
    },
  ],
};

export const createInitialState = () => ({
  mode: "current",
  items: { items: {}, tree: [] },
  selectedResourceId: undefined,
  tempSelectedResourceId: undefined,
  bgm: {
    audioId: undefined,
    loop: true,
    volume: 500,
  },
});

export const setBgmAudio = (state, payload) => {
  state.bgm.audioId = payload.audioId;
};

export const setBgm = (state, payload) => {
  state.bgm = payload.bgm;
};

export const setMode = (state, payload) => {
  state.mode = payload.mode;
};

export const setRepositoryState = (state, payload) => {
  state.items = payload.audio;
};

export const selectBgm = ({ state }) => {
  return state.bgm;
};

export const selectTempSelectedResourceId = ({ state }) => {
  return state.tempSelectedResourceId;
};

export const setTempSelectedResource = (state, payload) => {
  state.tempSelectedResourceId = payload.resourceId;
};

export const selectSelectedResource = ({ state }) => {
  if (!state.bgm.audioId) {
    return null;
  }

  const flatItems = toFlatItems(state.items);
  const item = flatItems.find((item) => item.id === state.bgm.audioId);

  if (!item) {
    return null;
  }

  return {
    resourceId: state.bgm.audioId,
    resourceType: "audio",
    fileId: item.fileId,
    name: item.name,
    item: item,
  };
};

export const selectBreadcrumb = ({ state }) => {
  const breadcrumb = [
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

  return breadcrumb;
};

export const selectViewData = ({ state }) => {
  const flatItems = toFlatItems(state.items).filter(
    (item) => item.type === "folder",
  );
  const flatGroups = toFlatGroups(state.items).map((group) => {
    return {
      ...group,
      children: group.children.map((child) => {
        const isSelected = child.id === state.tempSelectedResourceId;
        return {
          ...child,
          bw: isSelected ? "md" : "",
          bc: isSelected ? "fg" : "",
          waveformDataFileId: child.waveformDataFileId,
        };
      }),
    };
  });

  const selectedResource = selectSelectedResource({ state });
  const breadcrumb = selectBreadcrumb({ state });

  const defaultValues = {
    loop: state.bgm?.loop ?? true,
    volume: state.bgm?.volume ?? 500,
    delay: state.bgm?.delay,
    audioWaveformDataFileId: selectedResource?.item?.waveformDataFileId || "",
  };

  return {
    mode: state.mode,
    audio: selectedResource?.item,
    items: flatItems,
    groups: flatGroups,
    tempSelectedResourceId: state.tempSelectedResourceId,
    breadcrumb,
    form,
    defaultValues,
  };
};
