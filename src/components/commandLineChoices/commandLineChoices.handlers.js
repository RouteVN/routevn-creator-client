const resolveSelectedResourceId = ({ layouts, resourceId } = {}) => {
  const availableLayouts = (layouts ?? []).filter(
    (layout) => layout.layoutType === "choice",
  );

  if (
    resourceId &&
    availableLayouts.some((layout) => layout.id === resourceId)
  ) {
    return resourceId;
  }

  return availableLayouts[0]?.id ?? "";
};

const buildChoicesDataFromState = (
  deps,
  { includeEditingDraft = false } = {},
) => {
  const { store, props } = deps;
  const selectedResourceId = resolveSelectedResourceId({
    layouts: props?.layouts,
    resourceId: store.selectSelectedResourceId(),
  });

  if (!selectedResourceId) {
    return undefined;
  }

  const items = includeEditingDraft
    ? store.selectItemsWithEditingDraft()
    : store.selectItems();
  const choicesData = {
    items,
  };

  if (selectedResourceId !== "") {
    choicesData.resourceId = selectedResourceId;
  }

  return choicesData;
};

const dispatchTemporaryPresentationStateChange = (deps) => {
  const { dispatchEvent } = deps;

  if (typeof dispatchEvent !== "function") {
    return;
  }

  const choice = buildChoicesDataFromState(deps, {
    includeEditingDraft: true,
  });

  dispatchEvent(
    new CustomEvent("temporary-presentation-state-change", {
      detail: {
        presentationState: choice ? { choice } : {},
      },
    }),
  );
};

const readChoiceIndex = (payload = {}) => {
  const currentTarget = payload._event.currentTarget;
  const indexValue =
    currentTarget.dataset?.index ?? currentTarget.getAttribute("data-index");

  if (indexValue === undefined || indexValue === null || indexValue === "") {
    return undefined;
  }

  const index = Number(indexValue);

  return Number.isInteger(index) && index >= 0 ? index : undefined;
};

export const handleBeforeMount = (deps) => {
  const { store, props } = deps;
  store.setItems({ items: props.choice?.items || [] });
  store.setSelectedResourceId({
    resourceId: resolveSelectedResourceId({
      layouts: props.layouts,
      resourceId: props.choice?.resourceId,
    }),
  });
};

export const handleAfterMount = async (deps) => {
  const { projectService, store, render } = deps;
  await projectService.ensureRepository();
  const { animations, scenes } = projectService.getRepositoryState();
  store.setScenes({
    scenes,
  });
  store.setAnimations({
    animations,
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
  const index = readChoiceIndex(payload);

  if (index === undefined) {
    return;
  }

  store.setMode({ mode: "editChoice" });
  store.setEditingIndex({ index });

  render();
};

export const handleChoiceContextMenu = (deps, payload) => {
  const { store, render } = deps;
  payload._event.preventDefault();
  const index = readChoiceIndex(payload);

  if (index === undefined) {
    return;
  }

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
    dispatchTemporaryPresentationStateChange(deps);
  }
};

export const handleSaveChoiceClick = (deps) => {
  const { store, render, appService } = deps;

  const editForm = store.selectEditForm();

  if (!editForm.content || editForm.content.trim() === "") {
    appService.showAlert({
      message: "Choice content cannot be empty",
      title: "Warning",
    });
    return;
  }

  if (!editForm.actionType) {
    appService.showAlert({
      message: "Please select an action type",
      title: "Warning",
    });
    return;
  }

  if (editForm.actionType === "sectionTransition") {
    if (!editForm.sceneId) {
      appService.showAlert({
        message: "Please select a scene",
        title: "Warning",
      });
      return;
    }
    if (!editForm.sectionId) {
      appService.showAlert({
        message: "Please select a section",
        title: "Warning",
      });
      return;
    }
  }

  store.saveChoice();
  render();
  dispatchTemporaryPresentationStateChange(deps);
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
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleChoiceFormChange = (deps, payload) => {
  const { store, render } = deps;
  const { name, value: fieldValue } = payload._event.detail;

  store.updateEditForm({ field: name, value: fieldValue });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleChoiceUpdateVariablesChange = (deps, payload = {}) => {
  payload._event?.stopPropagation?.();
  const { store, render } = deps;
  const detail = payload._event?.detail || {};

  if (!Object.hasOwn(detail, "updateVariable")) {
    return;
  }

  store.updateEditForm({
    field: "updateVariable",
    value: detail.updateVariable,
  });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleChoiceUpdateVariablesDelete = (deps, payload = {}) => {
  payload._event?.stopPropagation?.();
  const { store, render } = deps;
  const actionType = payload._event?.detail?.actionType;

  if (actionType !== "updateVariable") {
    return;
  }

  store.updateEditForm({
    field: "updateVariable",
    value: undefined,
  });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleChoiceUpdateVariablesClose = (_deps, payload = {}) => {
  payload._event?.stopPropagation?.();
};

export const handleChoiceItemClick = (deps) => {
  const { render } = deps;
  // Placeholder for choice item interaction
  render();
};

export const handleSubmitClick = (deps) => {
  const { dispatchEvent, appService } = deps;
  const choicesData = buildChoicesDataFromState(deps);

  if (!choicesData) {
    appService.showAlert({
      message: "Please select a choice layout",
      title: "Warning",
    });
    return;
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
  const index = Number.parseInt(
    payload._event.currentTarget.id.replace("removeChoice", ""),
    10,
  );

  store.removeChoice({ index });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleLayoutSelectChange = (deps, payload) => {
  const { store, render } = deps;
  const resourceId = payload._event.detail.value;

  store.setSelectedResourceId({ resourceId });
  render();
  dispatchTemporaryPresentationStateChange(deps);
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
    dispatchTemporaryPresentationStateChange(deps);
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

  if (item.value === "moveUp" && Number.isInteger(choiceIndex)) {
    store.moveChoice({ index: choiceIndex, direction: "up" });
  } else if (item.value === "moveDown" && Number.isInteger(choiceIndex)) {
    store.moveChoice({ index: choiceIndex, direction: "down" });
  } else if (item.value === "delete" && Number.isInteger(choiceIndex)) {
    store.removeChoice({ index: choiceIndex });
  }

  store.hideDropdownMenu();
  render();
  dispatchTemporaryPresentationStateChange(deps);
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
      dispatchTemporaryPresentationStateChange(deps);
    }
  }
};
