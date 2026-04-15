const toBoolean = (value) => {
  return value === true || value === "true";
};

const getLayoutTypeByMode = (mode) => {
  return mode === "nvl" ? "dialogue-nvl" : "dialogue-adv";
};

const resolveDialogueMode = ({ layouts, dialogue } = {}) => {
  const resourceId = dialogue?.ui?.resourceId ?? dialogue?.gui?.resourceId;
  const layoutType = (layouts ?? []).find(
    (layout) => layout.id === resourceId,
  )?.layoutType;

  if (dialogue?.mode === "nvl" || layoutType === "dialogue-nvl") {
    return "nvl";
  }

  return "adv";
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

const syncDialogueStateFromProps = (deps, dialogue = {}) => {
  const { store, props } = deps;
  const selectedMode = resolveDialogueMode({
    layouts: props?.layouts,
    dialogue,
  });
  const selectedResourceId =
    dialogue?.ui?.resourceId || dialogue?.gui?.resourceId || "";

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
    characterId: dialogue?.characterId || "",
  });

  store.setClearPage({
    clearPage: dialogue?.clearPage === true,
  });
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
  syncDialogueStateFromProps(deps, deps.props?.dialogue);
};

export const handleAfterMount = (deps) => {
  syncDialogueFormValues(deps);
};

export const handleOnUpdate = (deps, changes) => {
  syncDialogueStateFromProps(deps, changes?.newProps?.dialogue);
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
  const effectiveMode = resolveDialogueMode({
    layouts: props?.layouts,
    dialogue: {
      mode: selectedMode,
      ui: {
        resourceId: selectedResourceId,
      },
    },
  });
  const effectiveResourceId = resolveSelectedResourceId({
    layouts: props?.layouts,
    mode: effectiveMode,
    resourceId: selectedResourceId,
  });

  if (!effectiveResourceId) {
    return;
  }

  // Create dialogue object with only non-empty values
  const dialogue = {
    mode: effectiveMode,
  };

  if (effectiveResourceId) {
    dialogue.ui = {
      resourceId: effectiveResourceId,
    };
  }
  if (selectedCharacterId) {
    dialogue.characterId = selectedCharacterId;
  }
  if (effectiveMode === "nvl" && toBoolean(clearPage)) {
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
