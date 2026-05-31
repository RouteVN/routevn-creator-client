const BLUR_KERNEL_SIZE_OPTIONS = [5, 7, 9, 11, 13, 15];
const DEFAULT_BLUR_KERNEL_SIZE = 9;
const BACKGROUND_INLINE_TRANSFORM_FIELDS = [
  "x",
  "y",
  "anchorX",
  "anchorY",
  "scaleX",
  "scaleY",
  "rotation",
  "originX",
  "originY",
];

const normalizeBlurKernelSize = (value) => {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    return DEFAULT_BLUR_KERNEL_SIZE;
  }

  if (BLUR_KERNEL_SIZE_OPTIONS.includes(parsedValue)) {
    return parsedValue;
  }

  return BLUR_KERNEL_SIZE_OPTIONS.reduce((closest, option) => {
    const currentDistance = Math.abs(option - parsedValue);
    const closestDistance = Math.abs(closest - parsedValue);
    return currentDistance < closestDistance ? option : closest;
  }, DEFAULT_BLUR_KERNEL_SIZE);
};

const normalizeActionWithBlur = (action = {}) => {
  const normalizedAction = {
    ...action,
  };

  if (
    normalizedAction.blur &&
    typeof normalizedAction.blur === "object" &&
    !Array.isArray(normalizedAction.blur)
  ) {
    normalizedAction.blur = {
      ...normalizedAction.blur,
      kernelSize: normalizeBlurKernelSize(normalizedAction.blur.kernelSize),
    };
  }

  return normalizedAction;
};

const normalizeBackgroundAction = (background = {}) => {
  const normalizedBackground = normalizeActionWithBlur(background);

  if (typeof normalizedBackground.transformId === "string") {
    for (const field of BACKGROUND_INLINE_TRANSFORM_FIELDS) {
      delete normalizedBackground[field];
    }
  }

  return normalizedBackground;
};

const normalizeActionItemsWithBlur = (action = {}) => {
  const normalizedAction = {
    ...action,
  };

  if (Array.isArray(normalizedAction.items)) {
    normalizedAction.items = normalizedAction.items.map((item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? normalizeActionWithBlur(item)
        : item,
    );
  }

  return normalizedAction;
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

  if (
    normalizedValue.screen &&
    typeof normalizedValue.screen === "object" &&
    !Array.isArray(normalizedValue.screen)
  ) {
    normalizedValue.screen = normalizeActionWithBlur(normalizedValue.screen);
  }

  if (
    normalizedValue.visual &&
    typeof normalizedValue.visual === "object" &&
    !Array.isArray(normalizedValue.visual)
  ) {
    normalizedValue.visual = normalizeActionItemsWithBlur(
      normalizedValue.visual,
    );
  }

  if (
    normalizedValue.character &&
    typeof normalizedValue.character === "object" &&
    !Array.isArray(normalizedValue.character)
  ) {
    normalizedValue.character = normalizeActionItemsWithBlur(
      normalizedValue.character,
    );
  }

  return normalizedValue;
};

export const normalizeLineActions = (value) => {
  return normalizeEngineActions(value);
};
