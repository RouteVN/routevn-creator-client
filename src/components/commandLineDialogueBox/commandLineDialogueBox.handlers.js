const toBoolean = (value) => {
  return value === true || value === "true";
};

const getLayoutTypeByMode = (mode) => {
  return mode === "nvl" ? "nvl" : "dialogue";
};

const resolveSelectedResourceId = ({ layouts, mode, resourceId } = {}) => {
  const selectedLayoutType = getLayoutTypeByMode(mode);
  const availableLayouts = (layouts ?? []).filter(
    (layout) => layout.layoutType === selectedLayoutType,
  );

  if (
    resourceId &&
    availableLayouts.some((layout) => layout.id === resourceId)
  ) {
    return resourceId;
  }

  return availableLayouts[0]?.id ?? "";
};

const syncDialogueFormValues = (deps) => {
  const { refs, store } = deps;
  const { selectedMode, selectedResourceId, selectedCharacterId, clearPage } =
    store.getState();

  refs.dialogueForm.reset();
  refs.dialogueForm.setValues({
    values: {
      mode: selectedMode,
      resourceId: selectedResourceId,
      characterId: selectedCharacterId,
      clearPage,
    },
  });
};

export const handleBeforeMount = (deps) => {
  const { store, props } = deps;
  const selectedMode = props?.dialogue?.mode || "adv";
  const selectedResourceId =
    props?.dialogue?.ui?.resourceId || props?.dialogue?.gui?.resourceId || "";

  store.setSelectedMode({
    mode: selectedMode,
  });
  store.setSelectedResource({
    resourceId: resolveSelectedResourceId({
      layouts: props?.layouts,
      mode: selectedMode,
      resourceId: selectedResourceId,
    }),
  });
  store.setSelectedCharacterId({
    characterId: props?.dialogue?.characterId || "",
  });

  store.setClearPage({
    clearPage: props?.dialogue?.clearPage === true,
  });
};

export const handleAfterMount = (deps) => {
  syncDialogueFormValues(deps);
};

export const handleFormChange = (deps, payload) => {
  const { store, render, props } = deps;
  const { values: formValues } = payload._event.detail;

  if (!formValues) {
    return;
  }

  const selectedMode = formValues.mode === "nvl" ? "nvl" : "adv";
  const modeChanged = selectedMode !== store.getState().selectedMode;

  store.setSelectedMode({ mode: selectedMode });
  store.setSelectedResource({
    resourceId: resolveSelectedResourceId({
      layouts: props?.layouts,
      mode: selectedMode,
      resourceId: formValues.resourceId || "",
    }),
  });
  store.setSelectedCharacterId({ characterId: formValues.characterId || "" });
  store.setClearPage({ clearPage: formValues.clearPage });

  render();

  if (modeChanged) {
    syncDialogueFormValues(deps);
  }
};

export const handleSubmitClick = (deps) => {
  const { store, dispatchEvent, props } = deps;
  const { selectedMode, selectedResourceId, selectedCharacterId, clearPage } =
    store.getState();
  const effectiveResourceId = resolveSelectedResourceId({
    layouts: props?.layouts,
    mode: selectedMode,
    resourceId: selectedResourceId,
  });

  if (!effectiveResourceId) {
    return;
  }

  // Create dialogue object with only non-empty values
  const dialogue = {
    mode: selectedMode,
  };

  if (effectiveResourceId) {
    dialogue.ui = {
      resourceId: effectiveResourceId,
    };
  }
  if (selectedCharacterId) {
    dialogue.characterId = selectedCharacterId;
  }
  if (selectedMode === "nvl" && toBoolean(clearPage)) {
    dialogue.clearPage = true;
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
