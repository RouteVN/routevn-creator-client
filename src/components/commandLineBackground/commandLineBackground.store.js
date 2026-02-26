import { toFlatGroups, toFlatItems } from "#domain-structure";

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

// Form structure will be created dynamically in selectViewData
const createEmptyCollection = () => ({
  items: {},
  tree: [],
});

const normalizeResourceCollection = (collection) => {
  const sourceItems =
    collection && typeof collection.items === "object" && collection.items
      ? collection.items
      : {};
  const items = { ...sourceItems };
  const tree = Array.isArray(collection?.tree) ? collection.tree : [];

  return { items, tree };
};

export const createInitialState = () => ({
  mode: "current",
  tab: "image", // "image", "layout", or "video"
  imageItems: createEmptyCollection(),
  layoutItems: createEmptyCollection(),
  videoItems: createEmptyCollection(),
  tweenItems: createEmptyCollection(),
  selectedResourceId: undefined,
  selectedResourceType: undefined,
  tempSelectedResourceId: undefined,
  selectedTweenId: undefined,
  backgroundLoop: false,
  pendingResourceId: undefined,
});

export const selectTempSelectedResourceId = ({ state }) => {
  return state.tempSelectedResourceId;
};

export const setMode = ({ state }, { mode } = {}) => {
  state.mode = mode;
};

export const setRepositoryState = (
  { state },
  { images, layouts, videos, tweens } = {},
) => {
  state.imageItems = normalizeResourceCollection(images);
  state.layoutItems = normalizeResourceCollection(layouts);
  state.videoItems = normalizeResourceCollection(videos);
  state.tweenItems = normalizeResourceCollection(tweens);
};

export const setTab = ({ state }, { tab } = {}) => {
  state.tab = tab;
};

export const setSelectedResource = (
  { state },
  { resourceId, resourceType } = {},
) => {
  state.selectedResourceId = resourceId;
  state.selectedResourceType = resourceType;

  // Automatically set the tab based on resource type
  if (resourceType) {
    state.tab = resourceType;
  }
};

export const setTempSelectedResource = ({ state }, { resourceId } = {}) => {
  state.tempSelectedResourceId = resourceId;
};

export const setPendingResourceId = ({ state }, { resourceId } = {}) => {
  state.pendingResourceId = resourceId;
};

export const selectPendingResourceId = ({ state }) => {
  return state.pendingResourceId;
};

export const clearPendingResourceId = ({ state }, _payload = {}) => {
  state.pendingResourceId = undefined;
};

export const setSelectedTween = ({ state }, { tweenId } = {}) => {
  state.selectedTweenId = tweenId;
};

export const selectSelectedTween = ({ state }) => {
  return state.selectedTweenId;
};

export const setBackgroundLoop = ({ state }, { loop } = {}) => {
  state.backgroundLoop = loop;
};

export const selectBackgroundLoop = ({ state }) => {
  return state.backgroundLoop;
};

export const selectTab = ({ state }) => {
  return state.tab;
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
      label: "Background",
      click: true,
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
  const items = itemsMap[state.tab] || createEmptyCollection();
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

  // Create tween options from repository tweens using the same pattern as layouts
  const flatTweens = toFlatItems(state.tweenItems || []).filter(
    (item) => item.type === "tween",
  );
  const tweenOptions = flatTweens.map((tween) => ({
    value: tween.id,
    label: tween.name || tween.id,
  }));

  // Add a "None" option at the beginning
  tweenOptions.unshift({ value: "none", label: "None" });

  const formFields = [
    {
      type: "slot",
      slot: "background",
      description: "Background",
    },
  ];

  if (selectedResource?.resourceType === "video") {
    formFields.push({
      name: "loop",
      label: "Loop Video",
      type: "select",
      options: [
        { value: true, label: "Loop" },
        { value: false, label: "Don't Loop" },
      ],
    });
  }

  formFields.push({
    name: "tween",
    label: "Tween Animation",
    type: "select",
    options: tweenOptions,
  });

  const form = {
    fields: formFields,
  };

  const defaultValues = {
    background: selectedResource?.fileId || "",
    tween: state.selectedTweenId,
    loop: state.backgroundLoop ?? false,
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
