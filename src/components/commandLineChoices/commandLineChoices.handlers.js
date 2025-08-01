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
    console.log(
      "[handleChoiceClick] Switching to editChoice mode, index:",
      index,
    );

    store.setMode("editChoice");
    store.setEditingIndex(index);

    // Validate state using selectors before rendering
    const mode = store.selectMode();
    const editForm = store.selectEditForm();
    console.log("[handleChoiceClick] Mode:", mode, "EditForm:", editForm);

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

export const handleChoiceFormInput = (e, deps) => {
  const { store, render } = deps;
  const { field, value } = e.detail;

  store.updateEditForm({ field, value });
  render();
};

export const handleChoiceFormChange = (e, deps) => {
  const { store, render } = deps;
  const { field, value } = e.detail;

  store.updateEditForm({ field, value });
  render();
};

export const handleChoiceItemClick = (e, deps) => {
  const { store, render } = deps;
  // Placeholder for choice item interaction
  render();
};

export const handleSubmitClick = (e, deps) => {
  const { dispatchEvent, store } = deps;
  const choices = store.selectChoices();
  const selectedLayoutId = store.selectSelectedLayoutId();

  // Create choices object with only non-empty values
  const choicesData = {
    choices: choices,
  };
  if (selectedLayoutId && selectedLayoutId !== "") {
    choicesData.layoutId = selectedLayoutId;
  }

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        choices: choicesData,
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

export const handleChoiceTextInput = (e, deps) => {
  const { store, render } = deps;
  const index = parseInt(e.currentTarget.id.replace("choice-text-", ""));

  store.updateChoice({
    index: index,
    text: e.currentTarget.value,
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
    props?.line?.presentation?.choices ||
    props?.line?.presentation?.presentation?.choices;
  if (choicesData) {
    // Set existing choices by directly modifying choices array
    if (choicesData.choices && choicesData.choices.length > 0) {
      // Note: We need to update the state directly here during initialization
      // This is acceptable during mount phase
      const currentChoices = store.selectChoices();
      currentChoices.length = 0; // Clear existing
      choicesData.choices.forEach((choice) => {
        currentChoices.push({
          text: choice.text,
          action: choice.action || { type: "continue" },
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
    const currentChoices = store.selectChoices();

    // Reset choices to initial state first
    currentChoices.length = 0;
    currentChoices.push(
      { text: "Choice 1", action: { type: "continue" } },
      { text: "Choice 2", action: { type: "continue" } },
    );

    // Set existing choices
    if (choicesData.choices && choicesData.choices.length > 0) {
      currentChoices.length = 0; // Clear again
      choicesData.choices.forEach((choice) => {
        currentChoices.push({
          text: choice.text,
          action: choice.action || { type: "continue" },
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
  const { field, value } = e.detail;

  if (field === "layoutId") {
    store.setSelectedLayoutId({ layoutId: value });
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
