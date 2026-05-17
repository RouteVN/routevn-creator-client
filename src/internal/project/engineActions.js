const BACKGROUND_BLUR_KERNEL_SIZE_OPTIONS = [5, 7, 9, 11, 13, 15];
const DEFAULT_BACKGROUND_BLUR_KERNEL_SIZE = 9;

const normalizeBackgroundBlurKernelSize = (value) => {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    return DEFAULT_BACKGROUND_BLUR_KERNEL_SIZE;
  }

  if (BACKGROUND_BLUR_KERNEL_SIZE_OPTIONS.includes(parsedValue)) {
    return parsedValue;
  }

  return BACKGROUND_BLUR_KERNEL_SIZE_OPTIONS.reduce((closest, option) => {
    const currentDistance = Math.abs(option - parsedValue);
    const closestDistance = Math.abs(closest - parsedValue);
    return currentDistance < closestDistance ? option : closest;
  }, DEFAULT_BACKGROUND_BLUR_KERNEL_SIZE);
};

const normalizeBackgroundAction = (background = {}) => {
  const normalizedBackground = {
    ...background,
  };

  if (
    normalizedBackground.blur &&
    typeof normalizedBackground.blur === "object" &&
    !Array.isArray(normalizedBackground.blur)
  ) {
    normalizedBackground.blur = {
      ...normalizedBackground.blur,
      kernelSize: normalizeBackgroundBlurKernelSize(
        normalizedBackground.blur.kernelSize,
      ),
    };
  }

  return normalizedBackground;
};

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

  if (
    normalizedValue.background &&
    typeof normalizedValue.background === "object" &&
    !Array.isArray(normalizedValue.background)
  ) {
    normalizedValue.background = normalizeBackgroundAction(
      normalizedValue.background,
    );
  }

  return normalizedValue;
};

export const normalizeLineActions = (value) => {
  return normalizeEngineActions(value);
};
