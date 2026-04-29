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

  store.setSelectedVisualIndex({ index });
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
};

export const handleAnimationModeChange = (deps, payload) => {
  const { store, render } = deps;
  const index = Number.parseInt(payload._event.currentTarget.dataset.index, 10);
  const value = payload._event.detail.value;
  store.updateVisualAnimationMode({ index, animationMode: value });
  render();
};

export const handleAnimationChange = (deps, payload) => {
  const { store, render } = deps;
  const index = Number.parseInt(payload._event.currentTarget.dataset.index, 10);
  const value = payload._event.detail.value;
  store.updateVisualAnimation({ index, animationId: value });
  render();
};

export const handleFileExplorerItemClick = (deps, payload) => {
  const { refs, store, render } = deps;
  const { itemId, isFolder } = payload._event.detail;
  const { resourceId } = store.selectResourceExplorerTarget({ itemId });

  if (isFolder) {
    const groupElement = refs.galleryScroll?.querySelector(
      `[data-group-id="${itemId}"]`,
    );
    groupElement?.scrollIntoView?.({ block: "start" });
    return;
  }

  store.setTempSelectedResourceId({ resourceId });
  render();
};

export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  store.setSearchQuery({ value: payload._event.detail.value ?? "" });
  render();
};

export const handleResourceItemClick = (deps, payload) => {
  const { store, render } = deps;
  const resourceId = payload._event.currentTarget.dataset.resourceId;

  store.setTempSelectedResourceId({ resourceId });
  render();
};

export const handleResourceItemDoubleClick = (deps, payload) => {
  const { store, render } = deps;
  const resourceId = payload._event.currentTarget.dataset.resourceId;
  const item = store.selectResourceItemById({ resourceId });

  if (!item?.previewFileId) {
    return;
  }

  store.setTempSelectedResourceId({ resourceId });
  store.showFullImagePreview({ fileId: item.previewFileId });
  render();
};

export const handleSubmitClick = (deps) => {
  const { dispatchEvent, store } = deps;
  const selectedVisuals = store.selectSelectedVisuals();

  const visualData = {
    visual: {
      items: selectedVisuals.map((visual) => {
        const item = {
          id: visual.id,
          resourceId: visual.resourceId,
          transformId: visual.transformId,
        };

        if (visual.animations?.resourceId) {
          item.animations = {
            resourceId: visual.animations.resourceId,
          };
        }

        return item;
      }),
    },
  };

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
  }
};

export const handleRemoveVisualClick = (deps, payload) => {
  const { store, render } = deps;
  const index = parseInt(
    payload._event.currentTarget.id.replace("removeVisual", ""),
  );

  store.removeVisual({ index: index });
  render();
};

export const handleButtonSelectClick = (deps) => {
  const { store, render, appService } = deps;
  const mode = store.selectMode();
  const selectedVisualIndex = store.selectSelectedVisualIndex();
  const tempSelectedResourceId = store.selectTempSelectedResourceId();

  if (mode === "resource-select") {
    if (!tempSelectedResourceId) {
      appService.showAlert({
        message: "A resource is required.",
        title: "Warning",
      });
      return;
    }

    if (selectedVisualIndex === -1) {
      // Adding new visual
      store.addVisual({ resourceId: tempSelectedResourceId });
    } else {
      // Updating existing visual
      store.updateVisualResource({
        index: selectedVisualIndex,
        resourceId: tempSelectedResourceId,
      });
    }

    store.setTempSelectedResourceId({ resourceId: undefined });
    store.setMode({
      mode: "current",
    });
  }

  render();
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
};
