import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";
import { generatePrefixedId } from "../../internal/id.js";

const RESOURCE_TYPES = [
  { type: "image", label: "Images" },
  { type: "video", label: "Videos" },
  { type: "layout", label: "Layouts" },
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

const createEmptyCollection = () => ({
  items: {},
  tree: [],
});

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

const normalizeSelectedVisual = (visual = {}, animations = {}) => {
  const nextVisual = structuredClone(visual ?? {});
  const selectedAnimationId = nextVisual?.animations?.resourceId;
  const selectedAnimationMode = getAnimationModeById(
    animations,
    selectedAnimationId,
  );

  nextVisual.animationMode =
    nextVisual.animationMode ??
    selectedAnimationMode ??
    (selectedAnimationId ? "update" : "none");

  return nextVisual;
};

const getCollectionTree = (collection) => {
  if (Array.isArray(collection?.tree)) {
    return collection.tree;
  }
  if (Array.isArray(collection?.order)) {
    return collection.order;
  }

  return Object.keys(collection?.items || {}).map((id) => ({ id }));
};

const isSelectableVisualResource = (resourceType, item) => {
  return resourceType !== "layout" || item?.layoutType === "general";
};

const prefixTreeNode = (node, resourceType, items) => {
  const item = items[node.id];
  if (
    item?.type !== "folder" &&
    !isSelectableVisualResource(resourceType, item)
  ) {
    return undefined;
  }

  const prefixedNode = { id: `${resourceType}:${node.id}` };
  if (Array.isArray(node.children) && node.children.length > 0) {
    const children = node.children
      .map((child) => prefixTreeNode(child, resourceType, items))
      .filter(Boolean);
    if (children.length > 0) {
      prefixedNode.children = children;
    }
  }
  return prefixedNode;
};

const buildResourceExplorerItems = ({ images, videos, layouts } = {}) => {
  const collections = { image: images, video: videos, layout: layouts };
  const items = {};
  const tree = [];

  RESOURCE_TYPES.forEach(({ type, label }) => {
    const collection = collections[type] || { items: {}, tree: [] };
    const rootId = `${type}:root`;
    const childNodes = getCollectionTree(collection)
      .map((node) => prefixTreeNode(node, type, collection.items || {}))
      .filter(Boolean);

    items[rootId] = { type: "folder", name: label, resourceType: type };
    Object.entries(collection.items || {}).forEach(([id, item]) => {
      if (item.type !== "folder" && !isSelectableVisualResource(type, item)) {
        return;
      }

      items[`${type}:${id}`] = {
        ...item,
        resourceId: id,
        resourceType: type,
      };
    });

    tree.push({ id: rootId, children: childNodes });
  });

  return { items, tree };
};

const parseResourceExplorerId = (itemId = "") => {
  const separatorIndex = itemId.indexOf(":");
  if (separatorIndex === -1) {
    return { resourceType: undefined, resourceId: itemId };
  }

  return {
    resourceType: itemId.slice(0, separatorIndex),
    resourceId: itemId.slice(separatorIndex + 1),
  };
};

export const createInitialState = () => ({
  mode: "current",
  images: createEmptyCollection(),
  videos: createEmptyCollection(),
  layouts: createEmptyCollection(),
  transforms: createEmptyCollection(),
  animations: createEmptyCollection(),
  /**
   * Array of raw visual objects with the following structure:
   * {
   *   id: string,              // Unique visual ID
   *   resourceId: string,      // Image/video/layout resource ID
   *   transformId: string,     // Transform ID
   *   animations: object,      // Optional animation selection with resourceId
   * }
   */
  selectedVisuals: [],
  tempSelectedResourceId: undefined,
  selectedVisualIndex: undefined,
  searchQuery: "",
  fullImagePreviewVisible: false,
  fullImagePreviewFileId: undefined,
  dropdownMenu: {
    isOpen: false,
    position: { x: 0, y: 0 },
    visualIndex: null,
    items: [{ label: "Delete", type: "item", value: "delete" }],
  },
});

export const setMode = ({ state }, { mode } = {}) => {
  state.mode = mode;
};

export const setImages = ({ state }, { images } = {}) => {
  state.images = images;
};

export const setVideos = ({ state }, { videos } = {}) => {
  state.videos = videos;
};

export const setLayouts = ({ state }, { layouts } = {}) => {
  state.layouts = layouts;
};

export const setTransforms = ({ state }, { transforms } = {}) => {
  state.transforms = transforms;
};

export const setAnimations = ({ state }, { animations } = {}) => {
  state.animations = animations;
  state.selectedVisuals = state.selectedVisuals.map((visual) =>
    normalizeSelectedVisual(visual, state.animations),
  );
};

const generateVisualId = () => {
  return generatePrefixedId("visual-");
};

export const addVisual = ({ state }, { resourceId } = {}) => {
  const transformItems = toFlatItems(state.transforms).filter(
    (item) => item.type === "transform",
  );
  const defaultTransform =
    transformItems.length > 0 ? transformItems[0].id : undefined;

  state.selectedVisuals.push({
    id: generateVisualId(),
    resourceId: resourceId,
    transformId: defaultTransform,
    animationMode: "none",
  });
};

export const removeVisual = ({ state }, { index } = {}) => {
  state.selectedVisuals.splice(index, 1);
};

export const updateVisualTransform = ({ state }, { index, transform } = {}) => {
  if (state.selectedVisuals[index]) {
    state.selectedVisuals[index].transformId = transform;
  }
};

export const updateVisualAnimation = (
  { state },
  { index, animationId } = {},
) => {
  if (!state.selectedVisuals[index]) {
    return;
  }

  if (!animationId || animationId === "none") {
    state.selectedVisuals[index].animations = undefined;
    return;
  }

  state.selectedVisuals[index].animations = {
    resourceId: animationId,
  };

  const selectedAnimationMode = getAnimationModeById(
    state.animations,
    animationId,
  );
  if (selectedAnimationMode) {
    state.selectedVisuals[index].animationMode = selectedAnimationMode;
  }
};

export const updateVisualAnimationMode = (
  { state },
  { index, animationMode } = {},
) => {
  if (!state.selectedVisuals[index]) {
    return;
  }

  if (animationMode !== "update" && animationMode !== "transition") {
    state.selectedVisuals[index].animationMode = "none";
    state.selectedVisuals[index].animations = undefined;
    return;
  }

  state.selectedVisuals[index].animationMode = animationMode;

  const selectedAnimationId =
    state.selectedVisuals[index]?.animations?.resourceId;
  const selectedAnimationMode = getAnimationModeById(
    state.animations,
    selectedAnimationId,
  );
  if (selectedAnimationMode && selectedAnimationMode !== animationMode) {
    state.selectedVisuals[index].animations = undefined;
  }
};

export const updateVisualResource = ({ state }, { index, resourceId } = {}) => {
  if (state.selectedVisuals[index]) {
    state.selectedVisuals[index].resourceId = resourceId;
  }
};

export const clearVisuals = ({ state }, _payload = {}) => {
  state.selectedVisuals = [];
};

export const setTempSelectedResourceId = ({ state }, { resourceId } = {}) => {
  state.tempSelectedResourceId = resourceId;
};

export const setSearchQuery = ({ state }, { value } = {}) => {
  state.searchQuery = value ?? "";
};

export const showFullImagePreview = ({ state }, { fileId } = {}) => {
  if (!fileId) {
    return;
  }

  state.fullImagePreviewVisible = true;
  state.fullImagePreviewFileId = fileId;
};

export const hideFullImagePreview = ({ state }, _payload = {}) => {
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewFileId = undefined;
};

export const setSelectedVisualIndex = ({ state }, { index } = {}) => {
  state.selectedVisualIndex = index;
};

export const selectTempSelectedResourceId = ({ state }) => {
  return state.tempSelectedResourceId;
};

export const showDropdownMenu = ({ state }, { position, visualIndex } = {}) => {
  state.dropdownMenu.isOpen = true;
  state.dropdownMenu.position = position;
  state.dropdownMenu.visualIndex = visualIndex;
};

export const hideDropdownMenu = ({ state }, _payload = {}) => {
  state.dropdownMenu.isOpen = false;
  state.dropdownMenu.visualIndex = null;
};

export const selectDropdownMenuVisualIndex = ({ state }) => {
  return state.dropdownMenu.visualIndex;
};

export const selectSelectedVisuals = ({ state }) => {
  return state.selectedVisuals;
};

export const selectMode = ({ state }) => {
  return state.mode;
};

export const selectSelectedVisualIndex = ({ state }) => {
  return state.selectedVisualIndex;
};

export const selectResourceExplorerTarget = (_deps, { itemId } = {}) => {
  return parseResourceExplorerId(itemId);
};

export const setExistingVisuals = ({ state }, { visuals } = {}) => {
  state.selectedVisuals = (Array.isArray(visuals) ? visuals : []).map(
    (visual) => normalizeSelectedVisual(visual, state.animations),
  );
};

export const selectResourceItemById = ({ state }, { resourceId } = {}) => {
  const imageData = state.images.items?.[resourceId];
  if (imageData) {
    return {
      ...imageData,
      resourceType: "image",
      previewFileId: imageData.thumbnailFileId || imageData.fileId,
    };
  }

  const videoData = state.videos.items?.[resourceId];
  if (videoData) {
    return {
      ...videoData,
      resourceType: "video",
      previewFileId: videoData.thumbnailFileId || videoData.fileId,
    };
  }

  const layoutData = state.layouts.items?.[resourceId];
  if (layoutData?.layoutType === "general") {
    return {
      ...layoutData,
      resourceType: "layout",
      previewFileId: layoutData.thumbnailFileId || layoutData.fileId,
    };
  }

  return undefined;
};

export const selectVisualsWithRepositoryData = ({ state }) => {
  if (!state.selectedVisuals || !Array.isArray(state.selectedVisuals)) {
    return [];
  }

  const imageItems = state.images?.items || {};
  const videoItems = state.videos?.items || {};
  const layoutItems = state.layouts?.items || {};

  return state.selectedVisuals.map((visual) => {
    const imageData = imageItems[visual.resourceId];
    const videoData = videoItems[visual.resourceId];
    const layoutData = layoutItems[visual.resourceId];

    let resourceData = null;
    let resourceType = null;

    if (imageData) {
      resourceData = imageData;
      resourceType = "image";
    } else if (videoData) {
      resourceData = videoData;
      resourceType = "video";
    } else if (layoutData) {
      resourceData = layoutData;
      resourceType = "layout";
    }

    return {
      ...visual,
      resource: resourceData,
      resourceType,
      displayName: resourceData?.name || "Unknown Resource",
      fileId: resourceData?.thumbnailFileId || resourceData?.fileId,
    };
  });
};

export const selectViewData = ({ state }) => {
  const searchQuery = (state.searchQuery ?? "").toLowerCase().trim();
  const matchesSearch = (item) => {
    if (!searchQuery) {
      return true;
    }

    const name = (item.name ?? "").toLowerCase();
    const description = (item.description ?? "").toLowerCase();
    return name.includes(searchQuery) || description.includes(searchQuery);
  };
  const buildResourceGroups = ({ collection, resourceType, childFilter }) => {
    return toFlatGroups(collection)
      .map((group) => {
        const children = group.children
          .filter(childFilter)
          .filter(matchesSearch)
          .map((child) => {
            const isSelected = child.id === state.tempSelectedResourceId;
            return {
              ...child,
              resourceType,
              previewFileId: child.thumbnailFileId || child.fileId,
              itemBorderColor: isSelected ? "pr" : "bo",
              itemHoverBorderColor: isSelected ? "pr" : "ac",
            };
          });

        return {
          ...group,
          resourceType,
          groupId: `${resourceType}:${group.id}`,
          children,
          hasChildren: children.length > 0,
          shouldDisplay: !searchQuery || children.length > 0,
        };
      })
      .filter((group) => group.shouldDisplay);
  };

  // Add images
  const imageGroups = buildResourceGroups({
    collection: state.images,
    resourceType: "image",
    childFilter: () => true,
  });

  // Add videos
  const videoGroups = buildResourceGroups({
    collection: state.videos,
    resourceType: "video",
    childFilter: () => true,
  });

  // Add layouts (only general type)
  const layoutGroups = buildResourceGroups({
    collection: state.layouts,
    resourceType: "layout",
    childFilter: (child) => child.layoutType === "general",
  });

  const resourceGroups = [...imageGroups, ...videoGroups, ...layoutGroups];
  const resourceItems = toFlatItems(
    buildResourceExplorerItems({
      images: state.images,
      videos: state.videos,
      layouts: state.layouts,
    }),
  ).filter((item) => item.type === "folder");

  // Get transform options
  const transformItems = toFlatItems(state.transforms).filter(
    (item) => item.type === "transform",
  );
  const transformOptions = transformItems.map((transform) => ({
    label: transform.name,
    value: transform.id,
  }));
  const animationItems = toFlatItems(state.animations).filter(
    (item) => item.type === "animation",
  );
  const updateAnimationOptions = animationItems
    .filter((item) => getAnimationType(item) === "update")
    .map((item) => ({
      value: item.id,
      label: item.name,
    }));
  const transitionAnimationOptions = animationItems
    .filter((item) => getAnimationType(item) === "transition")
    .map((item) => ({
      value: item.id,
      label: item.name,
    }));

  // Get enriched visual data
  const enrichedVisuals = selectVisualsWithRepositoryData({ state });
  const processedSelectedVisuals = enrichedVisuals.map((visual) => ({
    ...visual,
    displayName: visual.displayName || "Unknown Resource",
    animationMode:
      visual.animationMode ??
      getAnimationModeById(state.animations, visual.animations?.resourceId) ??
      "none",
  }));

  let breadcrumb = [
    {
      id: "actions",
      label: "Actions",
      click: true,
    },
  ];

  if (state.mode === "resource-select") {
    breadcrumb.push({
      id: "current",
      label: "Visuals",
      click: true,
    });
    breadcrumb.push({
      label: "Select Resource",
    });
  } else {
    breadcrumb.push({
      label: "Visuals",
    });
  }

  const defaultValues = {
    visuals: processedSelectedVisuals.map((visual) => ({
      ...visual,
      transformId:
        visual.transformId ||
        (transformOptions.length > 0 ? transformOptions[0].value : undefined),
      animationId: visual.animations?.resourceId,
    })),
    transformOptions,
    animationModeOptions: ANIMATION_MODE_OPTIONS,
    updateAnimationOptions,
    transitionAnimationOptions,
  };

  return {
    mode: state.mode,
    resourceItems,
    resourceGroups,
    selectedVisuals: processedSelectedVisuals,
    transformOptions,
    animationModeOptions: ANIMATION_MODE_OPTIONS,
    updateAnimationOptions,
    transitionAnimationOptions,
    searchQuery: state.searchQuery,
    searchPlaceholder: "Search...",
    fullImagePreviewVisible: state.fullImagePreviewVisible,
    fullImagePreviewFileId: state.fullImagePreviewFileId,
    breadcrumb,
    defaultValues,
    dropdownMenu: state.dropdownMenu,
  };
};
