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
  // {
  //   id: "video",
  //   label: "Videos",
  // },
];

// Form structure will be created dynamically in selectViewData

export const createInitialState = () => ({
  mode: "current",
  tab: "image", // "image", "layout", or "video"
  imageItems: { items: {}, tree: [] },
  layoutItems: { items: {}, tree: [] },
  videoItems: { items: {}, tree: [] },
  animationItems: { items: {}, tree: [] },
  selectedResourceId: undefined,
  selectedResourceType: undefined,
  tempSelectedResourceId: undefined,
  selectedAnimationId: undefined,
});

export const selectTempSelectedResourceId = ({ state }) => {
  return state.tempSelectedResourceId;
};

export const setMode = (state, payload) => {
  state.mode = payload.mode;
};

export const setRepositoryState = (state, payload) => {
  state.imageItems = payload.images;
  state.layoutItems = payload.layouts;
  state.videoItems = payload.videos;
  state.animationItems = payload.animations || [];
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

export const setSelectedAnimation = (state, payload) => {
  state.selectedAnimationId = payload.animationId;
};

export const selectSelectedAnimation = ({ state }) => {
  return state.selectedAnimationId;
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

  const layoutTypeLabels = {
    normal: "Normal",
    dialogue: "Dialogue",
    choice: "Choice",
  };

  return {
    resourceId: state.selectedResourceId,
    resourceType: state.selectedResourceType,
    fileId: item.fileId || item.thumbnailFileId,
    name: item.name,
    layoutType: item.layoutType,
    layoutTypeDisplay: item.layoutType
      ? layoutTypeLabels[item.layoutType] || item.layoutType
      : "Layout",
    item: item,
    tab: state.selectedResourceType,
  };
};

export const selectViewData = ({ state }) => {
  const itemsMap = {
    image: state.imageItems,
    layout: state.layoutItems,
    video: state.videoItems,
  };
  const items = itemsMap[state.tab] || { item: {}, tree: [] };
  const flatItems = toFlatItems(items).filter((item) => item.type === "folder");
  const flatGroups = toFlatGroups(items).map((group) => {
    return {
      ...group,
      children: group.children
        .filter(
          (layout) => state.tab !== "layout" || layout.layoutType === "normal",
        )
        .map((child) => {
          const isSelected = child.id === state.tempSelectedResourceId;
          const layoutTypeLabels = {
            normal: "Normal",
            dialogue: "Dialogue",
            choice: "Choice",
          };

          return {
            ...child,
            bw: isSelected ? "md" : "xs",
            bc: isSelected ? "pr" : "mu",
            layoutTypeDisplay: child.layoutType
              ? layoutTypeLabels[child.layoutType] || child.layoutType
              : "Layout",
          };
        }),
    };
  });

  const selectedResource = selectSelectedResource({ state });
  const breadcrumb = selectBreadcrumb({ state });

  // Create animation options from repository animations using the same pattern as layouts
  const flatAnimations = toFlatItems(state.animationItems || []).filter(
    (item) => item.type === "animation",
  );
  const animationOptions = flatAnimations.map((animation) => ({
    value: animation.id,
    label: animation.name || animation.id,
  }));

  // Add a "None" option at the beginning
  animationOptions.unshift({ value: "none", label: "None" });

  const form = {
    fields: [
      {
        inputType: "slot",
        slot: "background",
        description: "Background",
      },
      {
        name: "animation",
        label: "Animation",
        required: true,
        inputType: "select",
        options: animationOptions,
      },
    ],
  };

  const defaultValues = {
    background: selectedResource?.fileId || "",
    animation: state.selectedAnimationId,
  };

  return {
    mode: state.mode,
    tab: state.tab,
    tabs,
    breadcrumb,
    items: flatItems,
    groups: flatGroups,
    tempSelectedResourceId: state.tempSelectedResourceId,
    selectedResource,
    dialogueForm: {
      form,
      defaultValues,
    },
  };
};
