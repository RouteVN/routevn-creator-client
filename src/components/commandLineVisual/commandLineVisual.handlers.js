const TEMPORARY_VISUAL_PREVIEW_ID = "temporary-visual-preview";
const DEFAULT_VISUAL_LAYER = 50;
const VALID_VISUAL_LAYERS = [10, 30, 50, 70];

const getTemporaryVisualPreviewId = ({ visualId, resourceType } = {}) => {
  if (visualId) {
    return `${visualId}-${resourceType}-preview`;
  }

  return `${TEMPORARY_VISUAL_PREVIEW_ID}-${resourceType}`;
};

const getDropdownPositionFromEvent = (event) => {
  const rect = event?.currentTarget?.getBoundingClientRect?.();
  if (rect) {
    return { x: rect.left, y: rect.bottom };
  }

  return { x: event?.clientX ?? 0, y: event?.clientY ?? 0 };
};

const getIndexFromEvent = (event) => {
  const index = Number.parseInt(event?.currentTarget?.dataset?.index ?? "", 10);
  return Number.isInteger(index) ? index : undefined;
};

const getEventValue = (event) =>
  event?.detail?.value ?? event?.currentTarget?.value ?? event?.target?.value;

const normalizeVisualLayer = (layer) => {
  const parsedLayer = Number(layer);
  return VALID_VISUAL_LAYERS.includes(parsedLayer)
    ? parsedLayer
    : DEFAULT_VISUAL_LAYER;
};

const orderVisualItemsForSave = (items = []) =>
  items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const layerDelta =
        normalizeVisualLayer(b.item.layer) - normalizeVisualLayer(a.item.layer);
      return layerDelta || a.index - b.index;
    })
    .map(({ item }) => item);

const buildVisualItem = (visual = {}) => {
  const item = {
    id: visual.id,
    resourceId: visual.resourceId,
    transformId: visual.transformId,
    layer: visual.layer,
  };

  if (visual.resourceType) {
    item.resourceType = visual.resourceType;
  }

  if (visual.opacity !== undefined) {
    item.opacity = visual.opacity;
  }

  if (visual.blur) {
    item.blur = { ...visual.blur };
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
    return orderVisualItemsForSave(visualItems);
  }

  const tempSelectedResourceId = store.selectTempSelectedResourceId?.();
  const tempSelectedResourceType = store.selectTempSelectedResourceType?.();
  if (!tempSelectedResourceId || !tempSelectedResourceType) {
    return orderVisualItemsForSave(visualItems);
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
      layer: store.selectPendingVisualLayer?.(),
    });
    return orderVisualItemsForSave(visualItems);
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

  return orderVisualItemsForSave(visualItems);
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

  store.clearPendingVisualLayer?.();
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

export const handleLayerChange = (deps, payload) => {
  const { store, render } = deps;
  const index = Number.parseInt(payload._event.currentTarget.dataset.index, 10);
  const value = payload._event.detail.value;
  store.updateVisualLayer({ index, layer: value });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleOpacityInput = (deps, payload) => {
  const { store, render } = deps;
  const index = getIndexFromEvent(payload._event);

  if (index === undefined) {
    return;
  }

  store.updateVisualOpacity({
    index,
    opacity: getEventValue(payload._event),
  });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleBlurToggleChange = (deps, payload) => {
  const { store, render } = deps;
  const index = getIndexFromEvent(payload._event);

  if (index === undefined) {
    return;
  }

  store.updateVisualBlurEnabled({
    index,
    enabled: getEventValue(payload._event),
  });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleBlurFieldInput = (deps, payload) => {
  const { store, render } = deps;
  const index = getIndexFromEvent(payload._event);
  const fieldName = payload._event.currentTarget?.dataset?.blurField;

  if (index === undefined) {
    return;
  }

  store.updateVisualBlurField({
    index,
    fieldName,
    value: getEventValue(payload._event),
  });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleBlurFieldChange = handleBlurFieldInput;

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

export const handleAddVisualClick = (deps, payload = {}) => {
  const { store, render } = deps;

  store.clearPendingVisualLayer?.();
  store.showAddVisualLayerDropdownMenu({
    position: getDropdownPositionFromEvent(payload._event),
  });

  render();
};

export const handleBreadcumbClick = (deps, payload) => {
  const { dispatchEvent, store, render } = deps;

  if (payload._event.detail.id === "actions") {
    store.clearPendingVisualLayer?.();
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  } else if (payload._event.detail.id === "current") {
    store.setMode({
      mode: "current",
    });
    store.clearPendingVisualLayer?.();
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
        layer: store.selectPendingVisualLayer?.(),
      });
      store.clearPendingVisualLayer?.();
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
  const dropdownMenuType = store.selectDropdownMenuType?.();
  const visualIndex = store.selectDropdownMenuVisualIndex();

  if (dropdownMenuType === "add-visual-layer") {
    store.setPendingVisualLayer({ layer: item.layer });
    store.setSelectedVisualIndex({ index: -1 }); // -1 indicates new visual
    store.setMode({ mode: "resource-select" });
  } else if (item.value === "delete" && visualIndex !== null) {
    store.removeVisual({ index: visualIndex });
  } else if (item.value === "move-up" && visualIndex !== null) {
    store.moveVisual({ index: visualIndex, offset: 1 });
  } else if (item.value === "move-down" && visualIndex !== null) {
    store.moveVisual({ index: visualIndex, offset: -1 });
  }

  store.hideDropdownMenu();
  render();
  dispatchTemporaryPresentationStateChange(deps);
};
