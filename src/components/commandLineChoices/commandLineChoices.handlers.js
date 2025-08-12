export const handleAddChoiceClick = (e, deps) => {
  const { store, render } = deps;

  store.setMode("editChoice");
  store.setEditingIndex(-1); // -1 means new choice
  render();
};

export const handleChoiceClick = (e, deps) => {
  const { store, render } = deps;

  try {
    const index = parseInt(e.currentTarget.getAttribute("data-index"));

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

export const handleChoiceContextMenu = (e, deps) => {
  e.preventDefault();
  const { store, render } = deps;

  const index = parseInt(e.currentTarget.getAttribute("data-index"));

  store.showDropdownMenu({
    position: { x: e.clientX, y: e.clientY },
    choiceIndex: index,
  });

  render();
};

export const handleCancelEditClick = (e, deps) => {
  const { store, render } = deps;

  store.setMode("list");
  store.setEditingIndex(-1);

  // Ensure we have a clean state before rendering using selectors
  const mode = store.selectMode();
  if (mode === "list") {
    render();
  }
};

export const handleSaveChoiceClick = (e, deps) => {
  const { store, render } = deps;

  store.saveChoice();
  render();
};

// export const handleChoiceFormInput = (e, deps) => {
//   const { store, render } = deps;
//   const { name, fieldValue } = e.detail;
//
//   store.updateEditForm({ field: name, value: fieldValue });
//   render();
// };

export const handleChoiceFormChange = (e, deps) => {
  const { store, render } = deps;
  const { name, fieldValue } = e.detail;

  store.updateEditForm({ field: name, value: fieldValue });
  render();
};

export const handleChoiceItemClick = (e, deps) => {
  const { store, render } = deps;
  // Placeholder for choice item interaction
  render();
};

export const handleSubmitClick = (e, deps) => {
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

export const handleRemoveChoiceClick = (e, deps) => {
  const { store, render } = deps;
  const index = parseInt(e.currentTarget.id.replace("remove-choice-", ""));

  store.removeChoice(index);
  render();
};

export const handleChoiceContentInput = (e, deps) => {
  const { store, render } = deps;
  const index = parseInt(e.currentTarget.id.replace("choice-content-", ""));

  store.updateChoice({
    index: index,
    content: e.currentTarget.value,
  });
  render();
};

export const handleLayoutSelectChange = (e, deps) => {
  const { store, render } = deps;
  const layoutId = e.detail.value;

  store.setSelectedLayoutId({ layoutId });
  render();
};

export const handleBeforeMount = (deps) => {
  const { store, render, props } = deps;

  // Initialize from existing line data if available
  const choicesData =
    props?.line?.presentation?.choice ||
    props?.line?.presentation?.presentation?.choice;
  if (choicesData) {
    // Set existing items by directly modifying items array
    if (choicesData.items && choicesData.items.length > 0) {
      // Note: We need to update the state directly here during initialization
      // This is acceptable during mount phase
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

export const handlePropsChanged = (deps) => {
  const { store, render, props } = deps;

  // Re-initialize when props change
  const choicesData =
    props?.line?.presentation?.choices ||
    props?.line?.presentation?.presentation?.choices;
  if (choicesData) {
    const currentItems = store.selectItems();

    // Reset items to initial state first
    currentItems.length = 0;
    currentItems.push(
      { content: "Choice 1", action: { type: "continue" } },
      { content: "Choice 2", action: { type: "continue" } },
    );

    // Set existing items
    if (choicesData.items && choicesData.items.length > 0) {
      currentItems.length = 0; // Clear again
      choicesData.items.forEach((item) => {
        currentItems.push({
          content: item.content,
          action: item.action || { type: "continue" },
        });
      });
    }

    // Set selected layout
    store.setSelectedLayoutId({
      layoutId: choicesData.layoutId || "",
    });
  }

  render();
};

export const handleFormExtra = (e, deps) => {
  // No longer needed since we use direct handlers on slot elements
};

export const handleFormChange = (e, deps) => {
  const { store, render } = deps;
  const { name, fieldValue } = e.detail;

  if (name === "layoutId") {
    store.setSelectedLayoutId({ layoutId: fieldValue });
    render();
  }
};

export const handleDropdownMenuClose = (e, deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
};

export const handleDropdownMenuClickItem = (e, deps) => {
  const { store, render } = deps;
  const { item } = e.detail;
  const choiceIndex = store.selectDropdownMenuChoiceIndex();

  if (item.value === "delete" && choiceIndex !== null) {
    store.removeChoice(choiceIndex);
  }

  store.hideDropdownMenu();
  render();
};

export const handleBreadcumbClick = (e, deps) => {
  const { dispatchEvent, store, render } = deps;

  if (e.detail.id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  } else if (e.detail.id === "list") {
    store.setMode("list");
    store.setEditingIndex(-1);

    // Ensure we have a clean state before rendering using selectors
    const mode = store.selectMode();
    if (mode === "list") {
      render();
    }
  }
};
