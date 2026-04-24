import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";

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

const ANIMATION_MODE_OPTIONS = [
  {
    label: "None",
    value: "none",
  },
  {
    label: "Update",
    value: "update",
  },
  {
    label: "Transition",
    value: "transition",
  },
];

const PLAYBACK_CONTINUITY_OPTIONS = [
  {
    label: "Render",
    value: "render",
  },
  {
    label: "Persistent",
    value: "persistent",
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

const getAnimationType = (item = {}) => {
  return item?.animation?.type === "transition" ? "transition" : "update";
};

const getAnimationItemById = (collection = {}, animationId) => {
  if (!animationId) {
    return undefined;
  }

  return toFlatItems(collection).find(
    (item) => item.id === animationId && item.type === "animation",
  );
};

const getAnimationModeById = (collection = {}, animationId) => {
  const item = getAnimationItemById(collection, animationId);
  return item ? getAnimationType(item) : undefined;
};

export const createInitialState = () => ({
  mode: "current",
  tab: "image",
  imageItems: createEmptyCollection(),
  layoutItems: createEmptyCollection(),
  videoItems: createEmptyCollection(),
  animationItems: createEmptyCollection(),
  transformItems: createEmptyCollection(),
  selectedResourceId: undefined,
  selectedResourceType: undefined,
  tempSelectedResourceId: undefined,
  selectedTransformId: undefined,
  selectedAnimationMode: "none",
  selectedAnimationId: undefined,
  selectedAnimationPlaybackContinuity: "render",
  backgroundLoop: false,
  pendingResourceId: undefined,
  fullImagePreviewVisible: false,
  fullImagePreviewFileId: undefined,
  searchQuery: "",
});

export const selectTempSelectedResourceId = ({ state }) => {
  return state.tempSelectedResourceId;
};

export const setMode = ({ state }, { mode } = {}) => {
  state.mode = mode;
};

export const setRepositoryState = (
  { state },
  { images, layouts, videos, animations, transforms } = {},
) => {
  state.imageItems = normalizeResourceCollection(images);
  state.layoutItems = normalizeResourceCollection(layouts);
  state.videoItems = normalizeResourceCollection(videos);
  state.animationItems = normalizeResourceCollection(animations);
  state.transformItems = normalizeResourceCollection(transforms);

  const selectedAnimationMode = getAnimationModeById(
    state.animationItems,
    state.selectedAnimationId,
  );
  if (selectedAnimationMode) {
    state.selectedAnimationMode = selectedAnimationMode;
  }
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

export const showFullImagePreview = ({ state }, { imageId } = {}) => {
  const item = state.imageItems.items[imageId];
  if (!(item?.type === "image") || !item.fileId) {
    return;
  }

  state.fullImagePreviewVisible = true;
  state.fullImagePreviewFileId = item.fileId;
};

export const hideFullImagePreview = ({ state }, _payload = {}) => {
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewFileId = undefined;
};

export const setSearchQuery = ({ state }, { value } = {}) => {
  state.searchQuery = value ?? "";
};

export const setSelectedAnimationMode = ({ state }, { mode } = {}) => {
  if (mode !== "update" && mode !== "transition") {
    state.selectedAnimationMode = "none";
    state.selectedAnimationId = undefined;
    return;
  }

  state.selectedAnimationMode = mode;

  const selectedAnimationMode = getAnimationModeById(
    state.animationItems,
    state.selectedAnimationId,
  );
  if (selectedAnimationMode && selectedAnimationMode !== mode) {
    state.selectedAnimationId = undefined;
  }
};

export const selectSelectedAnimationMode = ({ state }) => {
  return state.selectedAnimationMode;
};

export const setSelectedAnimation = ({ state }, { animationId } = {}) => {
  state.selectedAnimationId = animationId === "none" ? undefined : animationId;

  const selectedAnimationMode = getAnimationModeById(
    state.animationItems,
    state.selectedAnimationId,
  );
  if (selectedAnimationMode) {
    state.selectedAnimationMode = selectedAnimationMode;
  }
};

export const selectSelectedAnimation = ({ state }) => {
  return state.selectedAnimationId;
};

export const setSelectedTransform = ({ state }, { transformId } = {}) => {
  state.selectedTransformId =
    typeof transformId === "string" && transformId.length > 0
      ? transformId
      : undefined;
};

export const selectSelectedTransform = ({ state }) => {
  return state.selectedTransformId;
};

export const setSelectedAnimationPlaybackContinuity = (
  { state },
  { continuity } = {},
) => {
  state.selectedAnimationPlaybackContinuity =
    continuity === "persistent" ? "persistent" : "render";
};

export const selectSelectedAnimationPlaybackContinuity = ({ state }) => {
  return state.selectedAnimationPlaybackContinuity;
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
    general: "General",
    "save-load": "Save / Load",
    confirmDialog: "Confirm Dialog",
    history: "History",
    "dialogue-adv": "Dialogue ADV",
    "dialogue-nvl": "Dialogue NVL",
    choice: "Choice",
  };

  const typeInfo = layoutTypeLabels[item.layoutType] ?? item.layoutType;

  return {
    resourceId: state.selectedResourceId,
    resourceType: state.selectedResourceType,
    fileId: item.thumbnailFileId || item.fileId,
    name: item.name,
    itemBorderColor: "bo",
    itemHoverBorderColor: "ac",
    typeInfo,
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
  const searchQuery = (state.searchQuery ?? "").toLowerCase().trim();
  const matchesSearch = (item) => {
    if (!searchQuery) {
      return true;
    }

    const name = (item.name ?? "").toLowerCase();
    const description = (item.description ?? "").toLowerCase();
    return name.includes(searchQuery) || description.includes(searchQuery);
  };
  const flatGroups = toFlatGroups(items)
    .map((group) => {
      const children = group.children
        .filter(
          (layout) => state.tab !== "layout" || layout.layoutType === "general",
        )
        .filter(matchesSearch)
        .map((child) => {
          const isSelected = child.id === state.tempSelectedResourceId;
          const itemBorderColor = isSelected ? "pr" : "bo";
          const itemHoverBorderColor = isSelected ? "pr" : "ac";
          const layoutTypeLabels = {
            general: "General",
            "save-load": "Save / Load",
            confirmDialog: "Confirm Dialog",
            history: "History",
            "dialogue-adv": "Dialogue ADV",
            "dialogue-nvl": "Dialogue NVL",
            choice: "Choice",
          };

          return {
            ...child,
            itemBorderColor,
            itemHoverBorderColor,
            typeInfo: layoutTypeLabels[child.layoutType] ?? child.layoutType,
            layoutTypeDisplay: child.layoutType
              ? layoutTypeLabels[child.layoutType] || child.layoutType
              : "Layout",
          };
        });

      return {
        ...group,
        children,
        hasChildren: children.length > 0,
        shouldDisplay: !searchQuery || children.length > 0,
      };
    })
    .filter((group) => group.shouldDisplay);

  const selectedResource = selectSelectedResource({ state });
  const breadcrumb = selectBreadcrumb({ state });
  const selectedAnimationMode = state.selectedAnimationMode ?? "none";
  const allAnimationItems = toFlatItems(state.animationItems).filter(
    (item) => item.type === "animation",
  );
  const updateAnimationOptions = allAnimationItems
    .filter((item) => getAnimationType(item) === "update")
    .map((item) => ({
      value: item.id,
      label: item.name,
    }));
  const transitionAnimationOptions = allAnimationItems
    .filter((item) => getAnimationType(item) === "transition")
    .map((item) => ({
      value: item.id,
      label: item.name,
    }));
  const transformOptions = toFlatItems(state.transformItems)
    .filter((item) => item.type === "transform")
    .map((item) => ({
      value: item.id,
      label: item.name,
    }));

  const formFields = [
    {
      type: "slot",
      slot: "background",
      description: "Background",
    },
    {
      name: "transformId",
      label: "Transform",
      type: "select",
      clearable: true,
      placeholder: "Select transform",
      options: transformOptions,
    },
    {
      name: "animationType",
      label: "Animation",
      type: "segmented-control",
      clearable: false,
      options: ANIMATION_MODE_OPTIONS,
    },
  ];

  if (selectedAnimationMode === "update") {
    formFields.push({
      name: "updateAnimation",
      label: "Update Animation",
      type: "select",
      clearable: false,
      placeholder: "Select update animation",
      options: updateAnimationOptions,
    });
  } else if (selectedAnimationMode === "transition") {
    formFields.push({
      name: "transitionAnimation",
      label: "Transition Animation",
      type: "select",
      clearable: false,
      placeholder: "Select transition animation",
      options: transitionAnimationOptions,
    });
  }

  if (selectedAnimationMode !== "none") {
    formFields.push({
      name: "playbackContinuity",
      label: "Playback Continuity",
      type: "segmented-control",
      clearable: false,
      options: PLAYBACK_CONTINUITY_OPTIONS,
    });
  }

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

  const form = {
    fields: formFields,
  };

  const defaultValues = {
    background: selectedResource?.fileId || "",
    transformId: state.selectedTransformId,
    playbackContinuity: state.selectedAnimationPlaybackContinuity,
    animationType: selectedAnimationMode,
    updateAnimation:
      selectedAnimationMode === "update"
        ? state.selectedAnimationId
        : undefined,
    transitionAnimation:
      selectedAnimationMode === "transition"
        ? state.selectedAnimationId
        : undefined,
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
    fullImagePreviewVisible: state.fullImagePreviewVisible,
    fullImagePreviewFileId: state.fullImagePreviewFileId,
    searchQuery: state.searchQuery,
    searchPlaceholder: "Search...",
    dialogueForm: {
      key: [
        selectedResource?.resourceType ?? "none",
        selectedResource?.resourceId ?? "none",
        state.selectedTransformId ?? "none",
        state.selectedAnimationPlaybackContinuity ?? "render",
        selectedAnimationMode,
        state.selectedAnimationId ?? "none",
        state.backgroundLoop ? "loop" : "no-loop",
      ].join(":"),
      form,
      defaultValues,
    },
  };
};
