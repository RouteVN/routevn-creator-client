export const handleBeforeMount = (deps) => {
  const { store, props } = deps;
  // Initialize with existing dialogue data if available
  if (props?.dialogue?.layoutId) {
    store.setSelectedLayoutId({
      layoutId: props.dialogue.layoutId,
    });
  }

  if (props?.dialogue?.characterId) {
    store.setSelectedCharacterId({
      characterId: props.dialogue.characterId,
    });
  }
};

export const handleFormChange = (deps, payload) => {
  const { store, render } = deps;
  const { formValues } = payload._event.detail;

  if (!formValues) {
    return;
  }

  if (formValues.layoutId !== undefined) {
    store.setSelectedLayoutId({ layoutId: formValues.layoutId });
  }

  if (formValues.characterId !== undefined) {
    store.setSelectedCharacterId({ characterId: formValues.characterId });
  }

  render();
};

export const handleSubmitClick = (deps) => {
  const { store, dispatchEvent } = deps;
  const { selectedLayoutId, selectedCharacterId } = store.getState();

  // Create dialogue object with only non-empty values
  const dialogue = {
    mode: "adv",
  };
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

export const handleBreadcumbClick = (deps, payload) => {
  const { dispatchEvent } = deps;

  if (payload._event.detail.id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  }
};
