import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";
import { generatePrefixedId } from "../../internal/id.js";

const RESOURCE_TYPES = [
  { type: "image", label: "Images" },
  { type: "video", label: "Videos" },
  { type: "layout", label: "Layouts" },
];

const tabs = RESOURCE_TYPES.map(({ type, label }) => ({
  id: type,
  label,
}));

const createEmptyCollection = () => ({
  items: {},
  tree: [],
});

const isHierarchyCollection = (value) =>
  !!value &&
  typeof value === "object" &&
  !!value.items &&
  typeof value.items === "object";

const normalizeResourceCollection = (collection, { defaultType } = {}) => {
  if (isHierarchyCollection(collection)) {
    return {
      items: { ...collection.items },
      tree: Array.isArray(collection.tree)
        ? collection.tree
        : Array.isArray(collection.order)
          ? collection.order
          : [],
    };
  }

  const collectionMap =
    collection && typeof collection === "object" ? collection : {};
  const items = {};
  const ids = [];

  for (const [resourceId, resource] of Object.entries(collectionMap)) {
    if (!resource || typeof resource !== "object") {
      continue;
    }

    const item = {
      id: resourceId,
      ...structuredClone(resource),
    };
    item.type = item.type || defaultType;
    items[resourceId] = item;
    ids.push(resourceId);
  }

  const sortedIds = ids.sort((a, b) => {
    const aTs = items[a]?.createdAt ?? 0;
    const bTs = items[b]?.createdAt ?? 0;
    if (aTs !== bTs) return aTs - bTs;
    if (a === b) return 0;
    return a < b ? -1 : 1;
  });
  const idSet = new Set(sortedIds);
  const rootParentKey = "__root__";
  const childrenByParent = new Map([[rootParentKey, []]]);

  for (const id of sortedIds) {
    const rawParentId = items[id]?.parentId;
    const parentId =
      typeof rawParentId === "string" &&
      rawParentId.length > 0 &&
      rawParentId !== id &&
      idSet.has(rawParentId)
        ? rawParentId
        : rootParentKey;

    if (!childrenByParent.has(parentId)) {
      childrenByParent.set(parentId, []);
    }
    childrenByParent.get(parentId).push(id);
  }

  const visited = new Set();
  const buildNodes = (parentId) => {
    const idsForParent = childrenByParent.get(parentId) || [];
    const nodes = [];

    for (const id of idsForParent) {
      if (visited.has(id)) {
        continue;
      }

      visited.add(id);
      const children = buildNodes(id);
      nodes.push(children.length > 0 ? { id, children } : { id });
    }

    return nodes;
  };

  const tree = buildNodes(rootParentKey);
  for (const id of sortedIds) {
    if (visited.has(id)) {
      continue;
    }

    visited.add(id);
    tree.push({ id });
  }

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
  if (Array.isArray(collection?.tree) && collection.tree.length > 0) {
    return collection.tree;
  }
  if (Array.isArray(collection?.order) && collection.order.length > 0) {
    return collection.order;
  }

  return Object.keys(collection?.items || {}).map((id) => ({ id }));
};

const isSelectableVisualResource = (resourceType, item) => {
  return resourceType !== "layout" || item?.layoutType === "general";
};

const selectResourceCollection = (state, resourceType) => {
  const collections = {
    image: state.images,
    video: state.videos,
    layout: state.layouts,
  };

  return collections[resourceType];
};

const getResourceTypeLabel = (resourceType) => {
  const resourceTypeItem = RESOURCE_TYPES.find(
    (item) => item.type === resourceType,
  );
  return resourceTypeItem?.label ?? resourceType;
};

const getActiveResourceType = (state) => {
  return RESOURCE_TYPES.some((item) => item.type === state.tab)
    ? state.tab
    : "image";
};

const resolveResourceItemByType = (
  state,
  { resourceId, resourceType } = {},
) => {
  if (!resourceId || !resourceType) {
    return undefined;
  }

  const collection = selectResourceCollection(state, resourceType);
  const resourceData = collection?.items?.[resourceId];
  if (
    !resourceData ||
    resourceData.type === "folder" ||
    !isSelectableVisualResource(resourceType, resourceData)
  ) {
    return undefined;
  }

  return {
    ...resourceData,
    resourceType,
    previewFileId: resourceData.thumbnailFileId || resourceData.fileId,
  };
};

const resolveResourceItem = (state, { resourceId, resourceType } = {}) => {
  if (!resourceId) {
    return undefined;
  }

  if (resourceType) {
    return resolveResourceItemByType(state, { resourceId, resourceType });
  }

  for (const resourceTypeEntry of RESOURCE_TYPES) {
    const resourceItem = resolveResourceItemByType(state, {
      resourceId,
      resourceType: resourceTypeEntry.type,
    });
    if (resourceItem) {
      return resourceItem;
    }
  }

  return undefined;
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

const buildResourceExplorerItems = ({ collection, resourceType } = {}) => {
  const items = {};
  const tree = getCollectionTree(collection)
    .map((node) => prefixTreeNode(node, resourceType, collection.items || {}))
    .filter(Boolean);

  Object.entries(collection.items || {}).forEach(([id, item]) => {
    if (
      item.type !== "folder" &&
      !isSelectableVisualResource(resourceType, item)
    ) {
      return;
    }

    items[`${resourceType}:${id}`] = {
      ...item,
      resourceId: id,
      resourceType,
    };
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
  tab: "image",
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
   *   resourceType: string,    // image/video/layout
   *   transformId: string,     // Transform ID
   *   animations: object,      // Optional animation selection with resourceId
   * }
   */
  selectedVisuals: [],
  tempSelectedResourceId: undefined,
  tempSelectedResourceType: undefined,
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

export const setTab = ({ state }, { tab } = {}) => {
  state.tab = RESOURCE_TYPES.some((item) => item.type === tab) ? tab : "image";
};

export const setImages = ({ state }, { images } = {}) => {
  state.images = normalizeResourceCollection(images, { defaultType: "image" });
};

export const setVideos = ({ state }, { videos } = {}) => {
  state.videos = normalizeResourceCollection(videos, { defaultType: "video" });
};

export const setLayouts = ({ state }, { layouts } = {}) => {
  state.layouts = normalizeResourceCollection(layouts, {
    defaultType: "layout",
  });
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

const getDefaultTransformId = (state) => {
  const transformItems = toFlatItems(state.transforms).filter(
    (item) => item.type === "transform",
  );

  return transformItems.length > 0 ? transformItems[0].id : undefined;
};

export const addVisual = ({ state }, { resourceId, resourceType } = {}) => {
  const defaultTransform = getDefaultTransformId(state);
  const visual = {
    id: generateVisualId(),
    resourceId: resourceId,
    transformId: defaultTransform,
    animationMode: "none",
  };

  if (resourceType) {
    visual.resourceType = resourceType;
  }

  state.selectedVisuals.push(visual);
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
    state.selectedVisuals[index].animationMode = "none";
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

export const updateVisualResource = (
  { state },
  { index, resourceId, resourceType } = {},
) => {
  if (state.selectedVisuals[index]) {
    state.selectedVisuals[index].resourceId = resourceId;
    state.selectedVisuals[index].resourceType = resourceType;
  }
};

export const clearVisuals = ({ state }, _payload = {}) => {
  state.selectedVisuals = [];
};

export const setTempSelectedResourceId = (
  { state },
  { resourceId, resourceType } = {},
) => {
  state.tempSelectedResourceId = resourceId;
  state.tempSelectedResourceType = resourceId ? resourceType : undefined;
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

export const selectTempSelectedResourceType = ({ state }) => {
  return state.tempSelectedResourceType;
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

export const selectTab = ({ state }) => {
  return getActiveResourceType(state);
};

export const selectSelectedVisualIndex = ({ state }) => {
  return state.selectedVisualIndex;
};

export const selectDefaultTransformId = ({ state }) => {
  return getDefaultTransformId(state);
};

export const selectResourceExplorerTarget = (_deps, { itemId } = {}) => {
  return parseResourceExplorerId(itemId);
};

export const setExistingVisuals = ({ state }, { visuals } = {}) => {
  state.selectedVisuals = (Array.isArray(visuals) ? visuals : []).map(
    (visual) => {
      const nextVisual = normalizeSelectedVisual(visual, state.animations);
      if (!nextVisual.resourceType) {
        const resource = resolveResourceItem(state, {
          resourceId: nextVisual.resourceId,
        });
        nextVisual.resourceType = resource?.resourceType;
      }
      return nextVisual;
    },
  );
};

export const selectResourceItemById = (
  { state },
  { resourceId, resourceType } = {},
) => {
  return resolveResourceItem(state, { resourceId, resourceType });
};

export const selectVisualsWithRepositoryData = ({ state }) => {
  if (!state.selectedVisuals || !Array.isArray(state.selectedVisuals)) {
    return [];
  }

  return state.selectedVisuals.map((visual) => {
    const resource = resolveResourceItem(state, {
      resourceId: visual.resourceId,
      resourceType: visual.resourceType,
    });

    return {
      ...visual,
      resource,
      resourceType: resource?.resourceType ?? visual.resourceType,
      displayName: resource?.name || "Unknown Resource",
      fileId: resource?.previewFileId,
    };
  });
};

export const selectViewData = ({ state }) => {
  const activeResourceType = getActiveResourceType(state);
  const activeResourceCollection =
    selectResourceCollection(state, activeResourceType) ??
    createEmptyCollection();
  const searchQuery = (state.searchQuery ?? "").toLowerCase().trim();
  const matchesSearch = (item) => {
    if (!searchQuery) {
      return true;
    }

    const name = (item.name ?? "").toLowerCase();
    const description = (item.description ?? "").toLowerCase();
    return name.includes(searchQuery) || description.includes(searchQuery);
  };
  const decorateResourceChild = (child, resourceType) => {
    const isSelected =
      child.id === state.tempSelectedResourceId &&
      resourceType === state.tempSelectedResourceType;
    return {
      ...child,
      resourceType,
      previewFileId: child.thumbnailFileId || child.fileId,
      itemBorderColor: isSelected ? "pr" : "bo",
      itemHoverBorderColor: isSelected ? "pr" : "ac",
    };
  };
  const buildResourceGroups = ({ collection, resourceType, childFilter }) => {
    const groups = toFlatGroups(collection);
    const groupedChildIds = new Set(
      groups.flatMap((group) => group.children.map((child) => child.id)),
    );
    const rootChildren = toFlatItems(collection)
      .filter((item) => item.type !== "folder")
      .filter((item) => !groupedChildIds.has(item.id))
      .filter(childFilter)
      .filter(matchesSearch)
      .map((child) => decorateResourceChild(child, resourceType));

    const rootGroup =
      rootChildren.length > 0
        ? [
            {
              id: `${resourceType}:root`,
              resourceType,
              groupId: `${resourceType}:root`,
              fullLabel: getResourceTypeLabel(resourceType),
              children: rootChildren,
              hasChildren: true,
              shouldDisplay: true,
            },
          ]
        : [];

    return [
      ...rootGroup,
      ...groups
        .map((group) => {
          const children = group.children
            .filter(childFilter)
            .filter(matchesSearch)
            .map((child) => decorateResourceChild(child, resourceType));

          return {
            ...group,
            resourceType,
            groupId: `${resourceType}:${group.id}`,
            children,
            hasChildren: children.length > 0,
            shouldDisplay: !searchQuery || children.length > 0,
          };
        })
        .filter((group) => group.shouldDisplay),
    ];
  };

  const activeChildFilter =
    activeResourceType === "layout"
      ? (child) => child.layoutType === "general"
      : () => true;
  const resourceGroups = buildResourceGroups({
    collection: activeResourceCollection,
    resourceType: activeResourceType,
    childFilter: activeChildFilter,
  });
  const resourceItems = toFlatItems(
    buildResourceExplorerItems({
      collection: activeResourceCollection,
      resourceType: activeResourceType,
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
  const animationOptions = animationItems.map((item) => ({
    value: item.id,
    label: item.name,
    suffixText:
      getAnimationType(item) === "transition" ? "Transition" : "Update",
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
    animationOptions,
  };

  return {
    mode: state.mode,
    tab: activeResourceType,
    tabs,
    resourceItems,
    resourceGroups,
    selectedVisuals: processedSelectedVisuals,
    transformOptions,
    animationOptions,
    searchQuery: state.searchQuery,
    searchPlaceholder: "Search...",
    fullImagePreviewVisible: state.fullImagePreviewVisible,
    fullImagePreviewFileId: state.fullImagePreviewFileId,
    breadcrumb,
    defaultValues,
    dropdownMenu: state.dropdownMenu,
  };
};
