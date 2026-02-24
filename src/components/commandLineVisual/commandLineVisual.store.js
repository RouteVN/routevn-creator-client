import { toFlatGroups, toFlatItems } from "#domain-structure";

export const createInitialState = () => ({
  mode: "current",
  images: { items: {}, order: [] },
  videos: { items: {}, order: [] },
  layouts: { items: {}, order: [] },
  transforms: { order: [], items: {} },
  /**
   * Array of raw visual objects with the following structure:
   * {
   *   id: string,              // Unique visual ID
   *   resourceId: string,      // Image/video/layout resource ID
   *   transformId: string,     // Transform ID
   * }
   */
  selectedVisuals: [],
  tempSelectedResourceId: undefined,
  selectedVisualIndex: undefined,
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

const generateVisualId = () => {
  return `visual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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

export const setExistingVisuals = ({ state }, { visuals } = {}) => {
  state.selectedVisuals = visuals;
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
      fileId: resourceData?.fileId || resourceData?.thumbnailFileId,
    };
  });
};

export const selectViewData = ({ state }) => {
  // Add images
  const imageGroups = toFlatGroups(state.images).map((group) => ({
    ...group,
    resourceType: "image",
    children: group.children.map((child) => ({
      ...child,
      resourceType: "image",
      previewFileId: child.fileId || child.thumbnailFileId,
      bw: child.id === state.tempSelectedResourceId ? "md" : "",
    })),
  }));

  // Add videos
  const videoGroups = toFlatGroups(state.videos).map((group) => ({
    ...group,
    resourceType: "video",
    children: group.children.map((child) => ({
      ...child,
      resourceType: "video",
      previewFileId: child.thumbnailFileId || child.fileId,
      bw: child.id === state.tempSelectedResourceId ? "md" : "",
    })),
  }));

  // Add layouts (only visual type)
  const layoutGroups = toFlatGroups(state.layouts)
    .map((group) => ({
      ...group,
      resourceType: "layout",
      children: group.children
        .filter((child) => child.layoutType === "visual")
        .map((child) => ({
          ...child,
          resourceType: "layout",
          previewFileId: child.fileId || child.thumbnailFileId,
          bw: child.id === state.tempSelectedResourceId ? "md" : "",
        })),
    }))
    .filter((group) => group.children.length > 0);

  const resourceGroups = [...imageGroups, ...videoGroups, ...layoutGroups];

  // Get transform options
  const transformItems = toFlatItems(state.transforms).filter(
    (item) => item.type === "transform",
  );
  const transformOptions = transformItems.map((transform) => ({
    label: transform.name,
    value: transform.id,
  }));

  // Get enriched visual data
  const enrichedVisuals = selectVisualsWithRepositoryData({ state });
  const processedSelectedVisuals = enrichedVisuals.map((visual) => ({
    ...visual,
    displayName: visual.displayName || "Unknown Resource",
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
    })),
    transformOptions,
  };

  return {
    mode: state.mode,
    resourceGroups,
    selectedVisuals: processedSelectedVisuals,
    transformOptions,
    breadcrumb,
    defaultValues,
    dropdownMenu: state.dropdownMenu,
  };
};
