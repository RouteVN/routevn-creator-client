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

  const hasNonClearFields = Object.keys(normalizedDialogue).some(
    (key) => key !== "clear",
  );
  if (normalizedDialogue.clear === true && hasNonClearFields) {
    delete normalizedDialogue.clear;
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

export const normalizeLineActions = (value) => {
  return normalizeEngineActions(value);
};
