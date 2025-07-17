export const handleOnMount = (deps) => {
  const { store, render, props } = deps;
  
  // Initialize with existing dialogue data if available
  if (props?.existingDialogue?.layoutId) {
    store.setSelectedLayoutId({
      layoutId: props.existingDialogue.layoutId,
    });
  }
};

export const handleOnUpdate = () => {
  
};

export const handleLayoutSelectChange = (e, deps) => {
  const { store, render } = deps;
  const layoutId = e.detail.value;

  store.setSelectedLayoutId({ layoutId });
  render();
};

export const handleSubmitClick = (e, deps) => {
  const { store, dispatchEvent } = deps;
  const { selectedLayoutId } = store.getState();

  if (!selectedLayoutId || selectedLayoutId === "") {
    return;
  }

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        dialogue: {
          layoutId: selectedLayoutId,
        },
      },
    }),
  );
};

export const handleBreadcumbActionsClick = (payload, deps) => {
  const { dispatchEvent } = deps;

  dispatchEvent(
    new CustomEvent("back-to-actions", {
      detail: {},
    }),
  );
};
