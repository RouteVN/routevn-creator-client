export const handleBeforeMount = (deps) => {
  const { store, props } = deps;
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

  store.setSelectedLayoutId({ layoutId: formValues.layoutId });
  store.setSelectedCharacterId({ characterId: formValues.characterId });

  render();
};

export const handleSubmitClick = (deps) => {
  const { store, dispatchEvent } = deps;
  const { selectedLayoutId, selectedCharacterId } = store.getState();

  // Create dialogue object with only non-empty values
  const dialogue = {
    mode: "adv",
  };
  if (!selectedLayoutId) {
    dialogue.clear = true;
  }
  dialogue.layoutId = selectedLayoutId;
  dialogue.characterId = selectedCharacterId;

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
