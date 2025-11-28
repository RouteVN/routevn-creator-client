export const handleBeforeMount = (deps) => {
  const { store, props } = deps;
  if (props?.dialogue?.gui?.resourceId) {
    store.setSelectedResource({
      resourceId: props.dialogue.gui.resourceId,
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

  store.setSelectedResource({ resourceId: formValues.resourceId });
  store.setSelectedCharacterId({ characterId: formValues.characterId });

  render();
};

export const handleSubmitClick = (deps) => {
  const { store, dispatchEvent } = deps;
  const { selectedResourceId, selectedCharacterId } = store.getState();

  // Create dialogue object with only non-empty values
  const dialogue = {
    mode: "adv",
  };
  if (!selectedResourceId) {
    dialogue.clear = true;
  }
  dialogue.gui = {
    resourceId: selectedResourceId,
  };
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
