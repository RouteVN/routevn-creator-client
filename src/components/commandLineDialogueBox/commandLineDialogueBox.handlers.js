const toBoolean = (value) => {
  return value === true || value === "true";
};

const getLayoutTypeByMode = (mode) => {
  return mode === "nvl" ? "nvl" : "dialogue";
};

export const handleBeforeMount = (deps) => {
  const { store, props } = deps;
  const selectedMode = props?.dialogue?.mode || "adv";
  const selectedLayoutType = getLayoutTypeByMode(selectedMode);
  const selectedResourceId = props?.dialogue?.gui?.resourceId || "";
  const selectedLayout = (props?.layouts || []).find(
    (layout) => layout.id === selectedResourceId,
  );

  store.setSelectedMode({
    mode: selectedMode,
  });
  store.setSelectedResource({
    resourceId:
      selectedLayout?.layoutType === selectedLayoutType
        ? selectedResourceId
        : "",
  });
  store.setSelectedCharacterId({
    characterId: props?.dialogue?.characterId || "",
  });

  store.setClearPage({
    clearPage: props?.dialogue?.clearPage === true,
  });
  store.setClear({
    clear: props?.dialogue?.clear === true,
  });
};

export const handleFormChange = (deps, payload) => {
  const { store, render, props } = deps;
  const { values: formValues } = payload._event.detail;

  if (!formValues) {
    return;
  }

  const selectedMode = formValues.mode === "nvl" ? "nvl" : "adv";
  const selectedLayoutType = getLayoutTypeByMode(selectedMode);
  const selectedResourceId = formValues.resourceId || "";
  const selectedLayout = (props?.layouts || []).find(
    (layout) => layout.id === selectedResourceId,
  );

  store.setSelectedMode({ mode: selectedMode });
  store.setSelectedResource({
    resourceId:
      selectedLayout?.layoutType === selectedLayoutType
        ? selectedResourceId
        : "",
  });
  store.setSelectedCharacterId({ characterId: formValues.characterId || "" });
  store.setClearPage({ clearPage: formValues.clearPage });
  store.setClear({ clear: formValues.clear });

  render();
};

export const handleSubmitClick = (deps) => {
  const { store, dispatchEvent, props } = deps;
  const {
    selectedMode,
    selectedResourceId,
    selectedCharacterId,
    clearPage,
    clear,
  } = store.getState();
  const selectedLayoutType = getLayoutTypeByMode(selectedMode);
  const availableLayouts = (props?.layouts || []).filter(
    (layout) => layout.layoutType === selectedLayoutType,
  );
  const effectiveResourceId =
    selectedResourceId || availableLayouts[0]?.id || "";

  // Create dialogue object with only non-empty values
  const dialogue = {
    mode: selectedMode,
  };

  if (effectiveResourceId) {
    dialogue.gui = {
      resourceId: effectiveResourceId,
    };
  }
  if (selectedCharacterId) {
    dialogue.characterId = selectedCharacterId;
  }
  if (selectedMode === "nvl" && toBoolean(clearPage)) {
    dialogue.clearPage = true;
  }
  if (toBoolean(clear)) {
    dialogue.clear = true;
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
