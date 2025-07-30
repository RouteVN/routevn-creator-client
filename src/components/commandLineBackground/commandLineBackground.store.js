import { toFlatGroups, toFlatItems } from "../../deps/repository";

const tabs = [
  {
    id: "image",
    label: "Images",
  },
  {
    id: "layout",
    label: "Layouts",
  },
  {
    id: "video",
    label: "Videos",
  },
];

const form = {
  fields: [
    {
      name: "background",
      label: "Background",
      required: true,
      inputType: "image",
      src: "${background.src}",
      width: 355,
      height: 200,
    },
    {
      name: "animation",
      label: "Animation",
      required: true,
      inputType: "select",
      options: [],
    },
  ],
};

export const INITIAL_STATE = Object.freeze({
  mode: "current",
  tab: "image", // "image", "layout", or "video"
  imageItems: [],
  layoutItems: [],
  videoItems: [],
  selectedResourceId: undefined,
  selectedResourceType: undefined,
  tempSelectedResourceId: undefined,
  context: {
    background: {
      src: undefined,
    },
  },
});

export const selectTempSelectedResourceId = ({ state }) => {
  return state.tempSelectedResourceId;
};

export const setContext = (state, payload) => {
  state.context = payload;
};

export const setMode = (state, payload) => {
  state.mode = payload.mode;
};

export const setRepositoryState = (state, payload) => {
  state.imageItems = payload.images;
  state.layoutItems = payload.layouts;
  state.videoItems = payload.videos;
};

export const setTab = (state, payload) => {
  state.tab = payload.tab;
};

export const setSelectedResource = (state, payload) => {
  state.selectedResourceId = payload.resourceId;
  state.selectedResourceType = payload.resourceType;

  // Automatically set the tab based on resource type
  state.tab = payload.resourceType;
};

export const setTempSelectedResource = (state, payload) => {
  state.tempSelectedResourceId = payload.resourceId;
};

export const selectTab = ({ state }) => {
  return state.tab;
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
      label: "Background",
    });
    breadcrumb.push({
      label: "Select",
    });
  } else {
    breadcrumb.push({
      label: "Background",
    });
  }

  return breadcrumb;
};

export const selectSelectedResource = ({ state }) => {
  if (!state.selectedResourceId || !state.selectedResourceType) {
    return null;
  }

  const itemsMap = {
    image: state.imageItems,
    layout: state.layoutItems,
    video: state.videoItems,
  };
  const itemsList = itemsMap[state.selectedResourceType] || [];

  const flatItems = toFlatItems(itemsList);
  const item = flatItems.find((item) => item.id === state.selectedResourceId);

  if (!item) {
    return null;
  }

  return {
    resourceId: state.selectedResourceId,
    resourceType: state.selectedResourceType,
    fileId: item.fileId,
    name: item.name,
    item: item,
    tab: state.selectedResourceType,
  };
};

export const toViewData = ({ state }) => {
  const itemsMap = {
    image: state.imageItems,
    layout: state.layoutItems,
    video: state.videoItems,
  };
  const items = itemsMap[state.tab] || [];
  const flatItems = toFlatItems(items).filter((item) => item.type === "folder");
  const flatGroups = toFlatGroups(items).map((group) => {
    return {
      ...group,
      children: group.children.map((child) => {
        const isSelected = child.id === state.tempSelectedResourceId;
        return {
          ...child,
          bw: isSelected ? "md" : "",
        };
      }),
    };
  });

  const selectedResource = selectSelectedResource({ state });
  const breadcrumb = selectBreadcrumb({ state });

  return {
    mode: state.mode,
    tab: state.tab,
    tabs,
    breadcrumb,
    items: flatItems,
    groups: flatGroups,
    tempSelectedResourceId: state.tempSelectedResourceId,
    dialogueForm: {
      form,
      defaultValues: {
        background: "",
        animation: "",
      },
    },
    context: state.context,
  };
};
