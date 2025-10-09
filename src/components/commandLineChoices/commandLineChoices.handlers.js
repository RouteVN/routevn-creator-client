export const handleBeforeMount = (deps) => {
  const { store, render, props } = deps;

  const choicesData = props?.choice;
  if (choicesData) {
    if (choicesData.items && choicesData.items.length > 0) {
      const currentItems = store.selectItems();
      currentItems.length = 0; // Clear existing
      choicesData.items.forEach((item) => {
        currentItems.push({
          content: item.content,
          action: item.action || { type: "continue" },
        });
      });
    }

    // Set selected layout
    if (choicesData.layoutId && choicesData.layoutId !== "") {
      store.setSelectedLayoutId({
        layoutId: choicesData.layoutId,
      });
    }
  }

  render();
};

export const handleAddChoiceClick = (deps) => {
  const { store, render } = deps;

  store.setMode("editChoice");
  store.setEditingIndex(-1); // -1 means new choice
  render();
};

export const handleChoiceClick = (deps, payload) => {
  const { store, render } = deps;

  try {
    const index = parseInt(
      payload._event.currentTarget.getAttribute("data-index"),
    );

    store.setMode("editChoice");
    store.setEditingIndex(index);

    // Validate state using selectors before rendering
    const mode = store.selectMode();
    const editForm = store.selectEditForm();

    if (mode === "editChoice" && editForm) {
      render();
    } else {
      console.error(
        "[handleChoiceClick] Invalid state for rendering - mode:",
        mode,
        "editForm:",
        editForm,
      );
    }
  } catch (error) {
    console.error("[handleChoiceClick] Error:", error);
  }
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

  store.setMode("list");
  store.setEditingIndex(-1);

  // Ensure we have a clean state before rendering using selectors
  const mode = store.selectMode();
  if (mode === "list") {
    render();
  }
};

export const handleSaveChoiceClick = (deps) => {
  const { store, render } = deps;

  store.saveChoice();
  render();
};

// export const handleChoiceFormInput = (deps, payload) => {
//   const { store, render } = deps;
//   const { name, fieldValue } = payload._event.detail;
//
//   store.updateEditForm({ field: name, value: fieldValue });
//   render();
// };

export const handleChoiceFormChange = (deps, payload) => {
  const { store, render } = deps;
  const { name, fieldValue } = payload._event.detail;

  store.updateEditForm({ field: name, value: fieldValue });
  render();
};

export const handleChoiceItemClick = (deps) => {
  const { render } = deps;
  // Placeholder for choice item interaction
  render();
};

export const handleSubmitClick = (deps) => {
  const { dispatchEvent, store } = deps;
  const items = store.selectItems();
  const selectedLayoutId = store.selectSelectedLayoutId();

  // Create choices object with new structure
  const choicesData = {
    items: items.map((item) => ({ content: item.content })),
  };
  if (selectedLayoutId && selectedLayoutId !== "") {
    choicesData.layoutId = selectedLayoutId;
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
    payload._event.currentTarget.id.replace("remove-choice-", ""),
  );

  store.removeChoice(index);
  render();
};

export const handleChoiceContentInput = (deps, payload) => {
  const { store, render } = deps;
  const index = parseInt(
    payload._event.currentTarget.id.replace("choice-content-", ""),
  );

  store.updateChoice({
    index: index,
    content: payload._event.currentTarget.value,
  });
  render();
};

export const handleLayoutSelectChange = (deps, payload) => {
  const { store, render } = deps;
  const layoutId = payload._event.detail.value;

  store.setSelectedLayoutId({ layoutId });
  render();
};

export const handleFormExtra = (_deps) => {
  // No longer needed since we use direct handlers on slot elements
};

export const handleFormChange = (deps, payload) => {
  const { store, render } = deps;
  const { name, fieldValue } = payload._event.detail;

  if (name === "layoutId") {
    store.setSelectedLayoutId({ layoutId: fieldValue });
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
    store.removeChoice(choiceIndex);
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
    store.setMode("list");
    store.setEditingIndex(-1);

    // Ensure we have a clean state before rendering using selectors
    const mode = store.selectMode();
    if (mode === "list") {
      render();
    }
  }
};
