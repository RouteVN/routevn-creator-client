export const handleAddChoiceClick = (e, deps) => {
  const { store, render } = deps;

  store.addChoice();
  render();
};

export const handleChoiceItemClick = (e, deps) => {
  const { store, render } = deps;
  // Placeholder for choice item interaction
  render();
};

export const handleSubmitClick = (e, deps) => {
  const { dispatchEvent, store } = deps;
  const { choices, selectedLayoutId } = store.getState();

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
  if (props?.line?.presentation?.choices) {
    const choicesData = props.line.presentation.choices;

    // Set existing choices
    if (choicesData.choices && choicesData.choices.length > 0) {
      choicesData.choices.forEach((choice, index) => {
        if (index === 0) {
          // Replace first choice
          store.updateChoice({
            index: 0,
            text: choice.text,
            target: choice.target || "",
          });
        } else if (index === 1) {
          // Replace second choice
          store.updateChoice({
            index: 1,
            text: choice.text,
            target: choice.target || "",
          });
        } else {
          // Add additional choices
          store.addChoice();
          store.updateChoice({
            index: index,
            text: choice.text,
            target: choice.target || "",
          });
        }
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
  if (props?.line?.presentation?.choices) {
    const choicesData = props.line.presentation.choices;

    // Reset choices to initial state first
    const currentState = store.getState();
    currentState.choices = [
      { text: "Choice 1", target: "" },
      { text: "Choice 2", target: "" },
    ];

    // Set existing choices
    if (choicesData.choices && choicesData.choices.length > 0) {
      choicesData.choices.forEach((choice, index) => {
        if (index < 2) {
          // Update existing choices
          store.updateChoice({
            index: index,
            text: choice.text,
            target: choice.target || "",
          });
        } else {
          // Add additional choices
          store.addChoice();
          store.updateChoice({
            index: index,
            text: choice.text,
            target: choice.target || "",
          });
        }
      });
    }

    // Set selected layout
    store.setSelectedLayoutId({
      layoutId: choicesData.layoutId || "",
    });
  }

  render();
};

export const handleBreadcumbActionsClick = (payload, deps) => {
  const { dispatchEvent } = deps;

  dispatchEvent(
    new CustomEvent("back-to-actions", {
      detail: {},
    }),
  );
};
