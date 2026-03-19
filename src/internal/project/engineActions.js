const normalizeDialogueAction = (dialogue = {}) => {
  const normalizedDialogue = {
    ...dialogue,
  };

  if (normalizedDialogue.gui && !normalizedDialogue.ui) {
    normalizedDialogue.ui = normalizedDialogue.gui;
  }
  delete normalizedDialogue.gui;

  if (typeof normalizedDialogue.content === "string") {
    normalizedDialogue.content = [{ text: normalizedDialogue.content }];
  }

  return normalizedDialogue;
};

export const normalizeEngineActions = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeEngineActions(entry));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const normalizedValue = Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      normalizeEngineActions(entry),
    ]),
  );

  if (
    normalizedValue.dialogue &&
    typeof normalizedValue.dialogue === "object" &&
    !Array.isArray(normalizedValue.dialogue)
  ) {
    normalizedValue.dialogue = normalizeDialogueAction(
      normalizedValue.dialogue,
    );
  }

  return normalizedValue;
};

const flattenLegacyLineActions = (actions) => {
  if (!actions || typeof actions !== "object" || Array.isArray(actions)) {
    return actions;
  }

  const nestedActions = actions.actions;
  if (
    !nestedActions ||
    typeof nestedActions !== "object" ||
    Array.isArray(nestedActions)
  ) {
    return actions;
  }

  const flattenedActions = {
    ...structuredClone(nestedActions),
    ...actions,
  };
  delete flattenedActions.actions;

  return flattenLegacyLineActions(flattenedActions);
};

export const normalizeLineActions = (value) => {
  return flattenLegacyLineActions(normalizeEngineActions(value));
};
