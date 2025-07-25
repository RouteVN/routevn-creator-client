export const handleBeforeMount = (deps) => {
  const { store, render, props } = deps;

  // Initialize with existing dialogue data if available
  if (props?.line?.presentation?.dialogue?.layoutId) {
    store.setSelectedLayoutId({
      layoutId: props.line.presentation.dialogue.layoutId,
    });
  }

  if (props?.line?.presentation?.dialogue?.characterId) {
    store.setSelectedCharacterId({
      characterId: props.line.presentation.dialogue.characterId,
    });
  }
};

export const handleFormChange = (e, deps) => {
  const { store, render } = deps;
  const formData = e.detail.formData;

  if (formData.layoutId !== undefined) {
    store.setSelectedLayoutId({ layoutId: formData.layoutId });
  }

  if (formData.characterId !== undefined) {
    store.setSelectedCharacterId({ characterId: formData.characterId });
  }

  render();
};

export const handleSubmitClick = (e, deps) => {
  const { store, dispatchEvent } = deps;
  const { selectedLayoutId, selectedCharacterId } = store.getState();

  // Create dialogue object with only non-empty values
  const dialogue = {};
  if (selectedLayoutId && selectedLayoutId !== "") {
    dialogue.layoutId = selectedLayoutId;
  }
  if (selectedCharacterId && selectedCharacterId !== "") {
    dialogue.characterId = selectedCharacterId;
  }

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        dialogue,
      },
    }),
  );
};

export const handleBreadcumbClick = (e, deps) => {
  const { dispatchEvent } = deps;

  if (e.detail.id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  }
};
