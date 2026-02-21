export const handleBeforeMount = (deps) => {
  const { store, props } = deps;
  store.setItems({ items: props.choice?.items || [] });
  store.setSelectedResourceId({
    resourceId: props.choice?.resourceId,
  });
};

export const handleAfterMount = async (deps) => {
  const { projectService, store, render } = deps;
  await projectService.ensureRepository();
  const { scenes } = projectService.getState();
  store.setScenes({
    scenes,
  });
  render();
};

export const handleAddChoiceClick = (deps) => {
  const { store, render } = deps;

  store.setMode({ mode: "editChoice" });
  store.setEditingIndex({ index: -1 }); // -1 means new choice
  render();
};

export const handleChoiceClick = (deps, payload) => {
  const { store, render } = deps;

  const index = parseInt(
    payload._event.currentTarget.getAttribute("data-index"),
  );

  store.setMode({ mode: "editChoice" });
  store.setEditingIndex({ index: index });

  render();
};

export const handleChoiceContextMenu = (deps, payload) => {
  payload._event.preventDefault();
  const { store, render } = deps;

  const index = parseInt(
    payload._event.currentTarget.getAttribute("data-index"),
  );

  store.showDropdownMenu({
    position: { x: payload._event.clientX, y: payload._event.clientY },
    choiceIndex: index,
  });

  render();
};

export const handleCancelEditClick = (deps) => {
  const { store, render } = deps;

  store.setMode({ mode: "list" });
  store.setEditingIndex({ index: -1 });

  // Ensure we have a clean state before rendering using selectors
  const mode = store.selectMode();
  if (mode === "list") {
    render();
  }
};

export const handleSaveChoiceClick = (deps) => {
  const { store, render, appService } = deps;

  const editForm = store.selectEditForm();

  if (!editForm.content || editForm.content.trim() === "") {
    appService.showToast("Choice content cannot be empty", {
      title: "Warning",
    });
    return;
  }

  if (!editForm.actionType) {
    appService.showToast("Please select an action type", { title: "Warning" });
    return;
  }

  if (editForm.actionType === "sectionTransition") {
    if (!editForm.sceneId) {
      appService.showToast("Please select a scene", { title: "Warning" });
      return;
    }
    if (!editForm.sectionId) {
      appService.showToast("Please select a section", { title: "Warning" });
      return;
    }
  }

  store.saveChoice();
  render();
};

export const handleChoiceFormInput = (deps, payload) => {
  const { store, render } = deps;

  const detail = payload?._event?.detail || {};
  const field =
    detail.name ??
    payload?._event?.target?.name ??
    payload?._event?.currentTarget?.name;
  const value =
    detail.value ??
    payload?._event?.target?.value ??
    payload?._event?.currentTarget?.value;

  if (!field) {
    return;
  }

  store.updateEditForm({ field, value });
  render();
};

export const handleChoiceFormChange = (deps, payload) => {
  const { store, render } = deps;
  const { name, value: fieldValue } = payload._event.detail;

  store.updateEditForm({ field: name, value: fieldValue });
  render();
};

export const handleChoiceItemClick = (deps) => {
  const { render } = deps;
  // Placeholder for choice item interaction
  render();
};

export const handleSubmitClick = (deps) => {
  const { dispatchEvent, store, appService } = deps;
  const items = store.selectItems();
  const selectedResourceId = store.selectSelectedResourceId();

  if (!selectedResourceId) {
    appService.showToast("Please select a choice layout", {
      title: "Warning",
    });
    return;
  }
  // Create choices object with new structure
  const choicesData = {
    items,
  };
  if (selectedResourceId && selectedResourceId !== "") {
    choicesData.resourceId = selectedResourceId;
  }

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        choice: choicesData,
      },
    }),
  );
};

export const handleRemoveChoiceClick = (deps, payload) => {
  const { store, render } = deps;
  const index = parseInt(
    payload._event.currentTarget.id.replace("removeChoice", ""),
  );

  store.removeChoice({ index: index });
  render();
};

export const handleLayoutSelectChange = (deps, payload) => {
  const { store, render } = deps;
  const resourceId = payload._event.detail.value;

  store.setSelectedResourceId({ resourceId });
  render();
};

export const handleFormExtra = (_deps) => {
  // No longer needed since we use direct handlers on slot elements
};

export const handleFormChange = (deps, payload) => {
  const { store, render } = deps;
  const { name, value: fieldValue } = payload._event.detail;

  if (name === "resourceId") {
    store.setSelectedResourceId({ resourceId: fieldValue });
    render();
  }
};

export const handleDropdownMenuClose = (deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
};

export const handleDropdownMenuClickItem = (deps, payload) => {
  const { store, render } = deps;
  const { item } = payload._event.detail;
  const choiceIndex = store.selectDropdownMenuChoiceIndex();

  if (item.value === "delete" && choiceIndex !== null) {
    store.removeChoice({ index: choiceIndex });
  }

  store.hideDropdownMenu();
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
  } else if (payload._event.detail.id === "list") {
    store.setMode({ mode: "list" });
    store.setEditingIndex({ index: -1 });

    // Ensure we have a clean state before rendering using selectors
    const mode = store.selectMode();
    if (mode === "list") {
      render();
    }
  }
};
