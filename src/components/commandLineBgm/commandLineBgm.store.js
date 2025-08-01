import { toFlatGroups, toFlatItems } from "../../deps/repository";
import { formatFileSize } from "../../utils/index.js";

const form = {
  fields: [
    {
      inputType: "slot",
      slot: "audio",
      description: "Background Music",
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

export const INITIAL_STATE = Object.freeze({
  mode: "current",
  items: [],
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
          selectedStyle: isSelected
            ? "outline: 2px solid var(--color-pr); outline-offset: 2px;"
            : "",
          waveformDataFileId: child.waveformDataFileId,
        };
      }),
    };
  });

  const selectedResource = selectSelectedResource({ state });
  const breadcrumb = selectBreadcrumb({ state });

  const loopOptions = [
    { label: "No Loop", value: "none" },
    { label: "Loop Once", value: "once" },
    { label: "Loop Forever", value: "forever" },
    { label: "Fade In/Out", value: "fade" },
  ];

  const defaultValues = {
    audioWaveformDataFileId: selectedResource?.item?.waveformDataFileId || "",
    loopType: props?.line?.presentation?.bgm?.loopType || "none",
  };

  return {
    mode: state.mode,
    items: flatItems,
    groups: flatGroups,
    loopOptions,
    tempSelectedResourceId: state.tempSelectedResourceId,
    breadcrumb,
    form,
    defaultValues,
  };
};
