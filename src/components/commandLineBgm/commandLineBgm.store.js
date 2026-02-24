import { toFlatGroups, toFlatItems } from "#domain-structure";

const form = {
  fields: [
    {
      type: "slot",
      slot: "audio",
      description: "Background Music",
    },
    {
      name: "loop",
      description: "Loop",
      type: "select",
      options: [
        { value: true, label: "Loop" },
        { value: false, label: "Don't Loop" },
      ],
    },
    {
      name: "volume",
      description: "Volume",
      type: "slider-with-input",
      min: 0,
      max: 1000,
      step: 1,
    },
  ],
};

export const createInitialState = () => ({
  mode: "current",
  items: { items: {}, order: [] },
  selectedResourceId: undefined,
  tempSelectedResourceId: undefined,
  bgm: {
    resourceId: undefined,
    loop: true,
    volume: 500,
  },
});

export const setBgmAudio = ({ state }, { resourceId } = {}) => {
  state.bgm.resourceId = resourceId;
};

export const setBgm = ({ state }, { bgm } = {}) => {
  state.bgm = bgm;
};

export const setMode = ({ state }, { mode } = {}) => {
  state.mode = mode;
};

export const setRepositoryState = ({ state }, { sounds } = {}) => {
  state.items = sounds;
};

export const selectBgm = ({ state }) => {
  return state.bgm;
};

export const selectTempSelectedResourceId = ({ state }) => {
  return state.tempSelectedResourceId;
};

export const setTempSelectedResource = ({ state }, { resourceId } = {}) => {
  state.tempSelectedResourceId = resourceId;
};

export const selectSelectedResource = ({ state }) => {
  if (!state.bgm.resourceId) {
    return null;
  }

  const flatItems = toFlatItems(state.items);
  const item = flatItems.find((item) => item.id === state.bgm.resourceId);

  if (!item) {
    return null;
  }

  return {
    resourceId: state.bgm.resourceId,
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
      click: true,
    },
  ];

  if (state.mode === "gallery") {
    breadcrumb.push({
      id: "current",
      label: "BGM",
      click: true,
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
