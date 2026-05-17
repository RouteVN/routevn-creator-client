const TEMPORARY_VISUAL_PREVIEW_ID = "temporary-visual-preview";

const getTemporaryVisualPreviewId = ({ visualId, resourceType } = {}) => {
  if (visualId) {
    return `${visualId}-${resourceType}-preview`;
  }

  return `${TEMPORARY_VISUAL_PREVIEW_ID}-${resourceType}`;
};

const buildVisualItem = (visual = {}) => {
  const item = {
    id: visual.id,
    resourceId: visual.resourceId,
    transformId: visual.transformId,
  };

  if (visual.resourceType) {
    item.resourceType = visual.resourceType;
  }

  if (visual.animations?.resourceId) {
    item.animations = {
      resourceId: visual.animations.resourceId,
    };
  }

  return item;
};

const buildVisualItemsFromState = (
  store,
  { includeTemporaryResource = false } = {},
) => {
  const visualItems = store.selectSelectedVisuals().map(buildVisualItem);

  if (!includeTemporaryResource || store.selectMode?.() !== "resource-select") {
    return visualItems;
  }

  const tempSelectedResourceId = store.selectTempSelectedResourceId?.();
  const tempSelectedResourceType = store.selectTempSelectedResourceType?.();
  if (!tempSelectedResourceId || !tempSelectedResourceType) {
    return visualItems;
  }

  const selectedVisualIndex = store.selectSelectedVisualIndex?.();
  if (selectedVisualIndex === -1) {
    visualItems.push({
      id: getTemporaryVisualPreviewId({
        resourceType: tempSelectedResourceType,
      }),
      resourceId: tempSelectedResourceId,
      resourceType: tempSelectedResourceType,
      transformId: store.selectDefaultTransformId?.(),
    });
    return visualItems;
  }

  if (
    Number.isInteger(selectedVisualIndex) &&
    visualItems[selectedVisualIndex]
  ) {
    const currentVisualItem = visualItems[selectedVisualIndex];
    const nextVisualItem = {
      ...currentVisualItem,
      resourceId: tempSelectedResourceId,
      resourceType: tempSelectedResourceType,
    };
    if (currentVisualItem.resourceType !== tempSelectedResourceType) {
      nextVisualItem.id = getTemporaryVisualPreviewId({
        visualId: currentVisualItem.id,
        resourceType: tempSelectedResourceType,
      });
    }

    visualItems[selectedVisualIndex] = {
      ...nextVisualItem,
    };
  }

  return visualItems;
};

const buildVisualDataFromState = (
  store,
  { includeTemporaryResource = false } = {},
) => ({
  visual: {
    items: buildVisualItemsFromState(store, {
      includeTemporaryResource,
    }),
  },
});

const dispatchTemporaryPresentationStateChange = (deps) => {
  const { dispatchEvent, store } = deps;

  if (typeof dispatchEvent !== "function") {
    return;
  }

  dispatchEvent(
    new CustomEvent("temporary-presentation-state-change", {
      detail: {
        presentationState: buildVisualDataFromState(store, {
          includeTemporaryResource: true,
        }),
      },
    }),
  );
};

export const handleAfterMount = async (deps) => {
  const { projectService, store, props, render } = deps;
  await projectService.ensureRepository();
  const { animations, images, videos, layouts, transforms } =
    projectService.getState();

  store.setImages({
    images: images || { tree: [], items: {} },
  });
  store.setVideos({
    videos: videos || { tree: [], items: {} },
  });
  store.setLayouts({
    layouts: layouts || { tree: [], items: {} },
  });
  store.setTransforms({
    transforms: transforms || { tree: [], items: {} },
  });
  store.setAnimations({
    animations: animations || { tree: [], items: {} },
  });

  // Use presentationState if available, otherwise fall back to visual prop
  let visualItems = null;

  if (props?.presentationState?.visual?.items) {
    visualItems = props.presentationState.visual.items;
  } else if (props?.visual?.items) {
    visualItems = props.visual.items;
  }

  if (visualItems) {
    store.setExistingVisuals({
      visuals: visualItems,
    });
  }

  render();
};

export const handleVisualClick = (deps, payload) => {
  const { store, render } = deps;
  const index = parseInt(payload._event.currentTarget.dataset.index);
  const visual = store.selectSelectedVisuals()?.[index];

  store.setSelectedVisualIndex({ index });
  if (visual?.resourceType) {
    store.setTab({ tab: visual.resourceType });
  }
  store.setMode({
    mode: "resource-select",
  });

  render();
};

export const handleVisualContextMenu = (deps, payload) => {
  payload._event.preventDefault();
  const { store, render } = deps;
  const index = parseInt(payload._event.currentTarget.dataset.index);

  store.showDropdownMenu({
    position: { x: payload._event.clientX, y: payload._event.clientY },
    visualIndex: index,
  });

  render();
};

export const handleTransformChange = (deps, payload) => {
  const { store, render } = deps;
  const index = Number.parseInt(payload._event.currentTarget.dataset.index, 10);
  const value = payload._event.detail.value;
  store.updateVisualTransform({ index, transform: value });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleAnimationChange = (deps, payload) => {
  const { store, render } = deps;
  const index = Number.parseInt(payload._event.currentTarget.dataset.index, 10);
  const value = payload._event.detail.value;
  store.updateVisualAnimation({ index, animationId: value });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleFileExplorerItemClick = (deps, payload) => {
  const { refs, store, render } = deps;
  const { itemId, isFolder } = payload._event.detail;
  const { resourceId, resourceType } = store.selectResourceExplorerTarget({
    itemId,
  });

  if (isFolder) {
    const groupElement = refs.galleryScroll?.querySelector(
      `[data-group-id="${itemId}"]`,
    );
    groupElement?.scrollIntoView?.({ block: "start" });
    return;
  }

  store.setTempSelectedResourceId({ resourceId, resourceType });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  store.setSearchQuery({ value: payload._event.detail.value ?? "" });
  render();
};

export const handleTabClick = (deps, payload) => {
  const { store, render } = deps;
  store.setTab({
    tab: payload._event.detail.id,
  });
  store.setTempSelectedResourceId({
    resourceId: undefined,
    resourceType: undefined,
  });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleResourceItemClick = (deps, payload) => {
  const { store, render } = deps;
  const resourceId = payload._event.currentTarget.dataset.resourceId;
  const resourceType = payload._event.currentTarget.dataset.resourceType;

  store.setTempSelectedResourceId({ resourceId, resourceType });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleResourceItemDoubleClick = (deps, payload) => {
  const { store, render } = deps;
  const resourceId = payload._event.currentTarget.dataset.resourceId;
  const resourceType = payload._event.currentTarget.dataset.resourceType;
  const item = store.selectResourceItemById({ resourceId, resourceType });

  if (!item?.previewFileId) {
    return;
  }

  store.setTempSelectedResourceId({ resourceId, resourceType });
  store.showFullImagePreview({ fileId: item.previewFileId });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleSubmitClick = (deps) => {
  const { dispatchEvent, store } = deps;
  const visualData = buildVisualDataFromState(store);

  dispatchEvent(
    new CustomEvent("submit", {
      detail: visualData,
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleAddVisualClick = (deps) => {
  const { store, render } = deps;

  store.setMode({
    mode: "resource-select",
  });
  store.setSelectedVisualIndex({ index: -1 }); // -1 indicates new visual

  render();
};

export const handleBreadcumbClick = (deps, payload) => {
  const { dispatchEvent, store, render } = deps;

  if (payload._event.detail.id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  } else if (payload._event.detail.id === "current") {
    store.setMode({
      mode: "current",
    });
    render();
    dispatchTemporaryPresentationStateChange(deps);
  }
};

export const handleRemoveVisualClick = (deps, payload) => {
  const { store, render } = deps;
  const index = parseInt(
    payload._event.currentTarget.id.replace("removeVisual", ""),
  );

  store.removeVisual({ index: index });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleButtonSelectClick = (deps) => {
  const { store, render, appService } = deps;
  const mode = store.selectMode();
  const selectedVisualIndex = store.selectSelectedVisualIndex();
  const tempSelectedResourceId = store.selectTempSelectedResourceId();
  const tempSelectedResourceType = store.selectTempSelectedResourceType();

  if (mode === "resource-select") {
    if (!tempSelectedResourceId || !tempSelectedResourceType) {
      appService.showAlert({
        message: "A resource is required.",
        title: "Warning",
      });
      return;
    }

    if (selectedVisualIndex === -1) {
      // Adding new visual
      store.addVisual({
        resourceId: tempSelectedResourceId,
        resourceType: tempSelectedResourceType,
      });
    } else {
      // Updating existing visual
      store.updateVisualResource({
        index: selectedVisualIndex,
        resourceId: tempSelectedResourceId,
        resourceType: tempSelectedResourceType,
      });
    }

    store.setTempSelectedResourceId({
      resourceId: undefined,
      resourceType: undefined,
    });
    store.setMode({
      mode: "current",
    });
  }

  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleDropdownMenuClose = (deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
};

export const handleDropdownMenuClickItem = (deps, payload) => {
  const { store, render } = deps;
  const { item } = payload._event.detail;
  const visualIndex = store.selectDropdownMenuVisualIndex();

  if (item.value === "delete" && visualIndex !== null) {
    store.removeVisual({ index: visualIndex });
  }

  store.hideDropdownMenu();
  render();
  dispatchTemporaryPresentationStateChange(deps);
};
