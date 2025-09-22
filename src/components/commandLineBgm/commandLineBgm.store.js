import { toFlatGroups, toFlatItems } from "../../deps/repository";
import { formatFileSize } from "../../utils/index.js";

const form = {
  fields: [
    {
      inputType: "slot",
      slot: "audio",
      description: "Background Music",
    },
  ],
};

export const INITIAL_STATE = Object.freeze({
  mode: "current",
  items: { items: {}, tree: [] },
  selectedResourceId: undefined,
  tempSelectedResourceId: undefined,
});

export const setMode = (state, payload) => {
  state.mode = payload.mode;
};

export const setRepositoryState = (state, payload) => {
  state.items = payload.audio;
};

export const selectTempSelectedResourceId = ({ state }) => {
  return state.tempSelectedResourceId;
};

export const setSelectedResource = (state, payload) => {
  state.selectedResourceId = payload.resourceId;
};

export const setTempSelectedResource = (state, payload) => {
  state.tempSelectedResourceId = payload.resourceId;
};

export const selectSelectedResource = ({ state }) => {
  if (!state.selectedResourceId) {
    return null;
  }

  const flatItems = toFlatItems(state.items);
  const item = flatItems.find((item) => item.id === state.selectedResourceId);

  if (!item) {
    return null;
  }

  return {
    resourceId: state.selectedResourceId,
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

export const toViewData = ({ state, props }) => {
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
    audioWaveformDataFileId: selectedResource?.item?.waveformDataFileId || "",
  };

  return {
    mode: state.mode,
    items: flatItems,
    groups: flatGroups,
    tempSelectedResourceId: state.tempSelectedResourceId,
    breadcrumb,
    form,
    defaultValues,
  };
};
