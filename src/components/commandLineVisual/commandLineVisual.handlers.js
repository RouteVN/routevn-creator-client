export const handleAfterMount = async (deps) => {
  const { projectService, store, props, render } = deps;
  await projectService.ensureRepository();
  const { images, videos, layouts, transforms } = projectService.getState();

  store.setImages({
    images: images || { order: [], items: {} },
  });
  store.setVideos({
    videos: videos || { order: [], items: {} },
  });
  store.setLayouts({
    layouts: layouts || { order: [], items: {} },
  });
  store.setTransforms({
    transforms: transforms || { order: [], items: {} },
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
  const id = payload._event.currentTarget?.id || payload._event.target?.id;
  const value =
    payload._event.detail?.value ||
    payload._event.currentTarget?.value ||
    payload._event.target?.value;

  // Extract index from ID (format: transform-{index})
  const index = parseInt(id.replace("transform", ""));
  store.updateVisualTransform({ index, transform: value });
  render();
};

export const handleResourceItemClick = (deps, payload) => {
  const { store, render } = deps;
  const target = payload._event.currentTarget;
  const resourceId =
    target?.dataset?.resourceId ||
    target?.id?.replace("resourceItem", "") ||
    "";

  store.setTempSelectedResourceId({ resourceId });
  render();
};

export const handleSubmitClick = (deps) => {
  const { dispatchEvent, store } = deps;
  const selectedVisuals = store.selectSelectedVisuals();

  const visualData = {
    visual: {
      items: selectedVisuals.map((visual) => ({
        id: visual.id,
        resourceId: visual.resourceId,
        transformId: visual.transformId,
      })),
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
      appService.showToast("A resource is required.", { title: "Warning" });
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
