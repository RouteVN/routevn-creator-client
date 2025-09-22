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
  console.log("e.detail", e.detail);
  const { formValues } = e.detail;

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

export const handleSubmitClick = (e, deps) => {
  console.log("[handleSubmitClick] Submit button clicked");
  const { store, dispatchEvent } = deps;
  const { selectedLayoutId, selectedCharacterId } = store.getState();

  console.log("[handleSubmitClick] Current state:", {
    selectedLayoutId,
    selectedCharacterId,
  });

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

  console.log("[handleSubmitClick] Dialogue object to submit:", dialogue);

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        dialogue,
      },
    }),
  );

  console.log("[handleSubmitClick] Submit event dispatched");
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
