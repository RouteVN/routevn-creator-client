export const handleBeforeMount = (deps) => {
  const { store, render, props } = deps;

  // Initialize with existing dialogue data if available
  if (props?.line?.layoutId) {
    store.setSelectedLayoutId({
      layoutId: props.line.layoutId,
    });
  }

  if (props?.line?.characterId) {
    store.setSelectedCharacterId({
      characterId: props.line.characterId,
    });
  }
};

export const handleLayoutSelectChange = (e, deps) => {
  const { store, render } = deps;
  const layoutId = e.detail.value;

  store.setSelectedLayoutId({ layoutId });
  render();
};

export const handleCharacterSelectChange = (e, deps) => {
  const { store, render } = deps;
  const characterId = e.detail.value;

  store.setSelectedCharacterId({ characterId });
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

export const handleBreadcumbActionsClick = (payload, deps) => {
  const { dispatchEvent } = deps;

  dispatchEvent(
    new CustomEvent("back-to-actions", {
      detail: {},
    }),
  );
};
