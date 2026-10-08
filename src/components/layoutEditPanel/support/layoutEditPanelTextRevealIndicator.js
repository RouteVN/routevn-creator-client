import { resolveSpritesheetFrameName } from "../../../internal/spritesheets.js";

const DEFAULT_TEXT_REVEAL_INDICATOR_SIZE = 12;
const DEFAULT_TEXT_REVEAL_INDICATOR_OFFSET_X = 16;
const DEFAULT_TEXT_REVEAL_INDICATOR_OFFSET_Y = 0;
// The dialog's sliders, which also bound a typed value.
const TEXT_REVEAL_INDICATOR_SIZE_RANGE = Object.freeze({
  min: 1,
  max: 256,
  step: 1,
});
const TEXT_REVEAL_INDICATOR_OFFSET_RANGE = Object.freeze({
  min: -128,
  max: 128,
  step: 1,
});

export const TEXT_REVEAL_INDICATOR_STATE_ITEMS = [
  { type: "item", label: "Revealing", key: "revealing" },
  { type: "item", label: "Complete", key: "complete" },
];

const TEXT_REVEAL_INDICATOR_STATE_LABELS = {
  revealing: "Revealing",
  complete: "Complete",
};
const TEXT_REVEAL_INDICATOR_STATE_LABEL_KEYS = {
  revealing: "revealingLabel",
  complete: "completeLabel",
};

export const isTextRevealIndicatorStateName = (value) =>
  value === "revealing" || value === "complete";

export const getTextRevealIndicatorStateLabel = (stateName, copy = {}) => {
  const key = TEXT_REVEAL_INDICATOR_STATE_LABEL_KEYS[stateName];
  return key
    ? (copy[key] ?? TEXT_REVEAL_INDICATOR_STATE_LABELS[stateName])
    : (copy.indicatorLabel ?? "Indicator");
};

export const isTextRevealIndicatorItemName = (name) =>
  name === "indicator.revealing" || name === "indicator.complete";

export const getTextRevealIndicatorStateNameFromItemName = (name) => {
  if (!isTextRevealIndicatorItemName(name)) {
    return undefined;
  }

  return name.slice("indicator.".length);
};

const toPositiveInteger = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
};

const toInteger = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
};

export const getImageDimensions = (imageItem) => {
  const width = Number(imageItem?.width);
  const height = Number(imageItem?.height);

  return {
    width: Number.isFinite(width) && width > 0 ? Math.round(width) : undefined,
    height:
      Number.isFinite(height) && height > 0 ? Math.round(height) : undefined,
  };
};

export const getSpritesheetAnimationDimensions = (
  spritesheetItem,
  animationName,
) => {
  const animation = spritesheetItem?.animations?.[animationName];
  const frameNames = Object.keys(spritesheetItem?.jsonData?.frames ?? {});
  const firstFrameRef = animation?.frames?.[0];
  const firstFrameName =
    resolveSpritesheetFrameName(frameNames, firstFrameRef) ?? frameNames[0];
  const firstFrame = spritesheetItem?.jsonData?.frames?.[firstFrameName];
  const width = Number(firstFrame?.sourceSize?.w ?? firstFrame?.frame?.w);
  const height = Number(firstFrame?.sourceSize?.h ?? firstFrame?.frame?.h);

  return {
    width: Number.isFinite(width) && width > 0 ? Math.round(width) : undefined,
    height:
      Number.isFinite(height) && height > 0 ? Math.round(height) : undefined,
  };
};

export const toTextRevealIndicatorVisualValues = (visual, indicator = {}) => {
  const source = visual && typeof visual === "object" ? visual : {};
  const kind =
    source.kind === "spritesheet" || source.resourceId
      ? "spritesheet"
      : "image";

  return {
    kind,
    imageId: source.imageId ?? "",
    resourceId: source.resourceId ?? "",
    animationName: source.animationName ?? "",
    width: source.width ?? DEFAULT_TEXT_REVEAL_INDICATOR_SIZE,
    height: source.height ?? DEFAULT_TEXT_REVEAL_INDICATOR_SIZE,
    offsetX:
      source.offsetX ??
      indicator.offsetX ??
      DEFAULT_TEXT_REVEAL_INDICATOR_OFFSET_X,
    offsetY:
      source.offsetY ??
      indicator.offsetY ??
      DEFAULT_TEXT_REVEAL_INDICATOR_OFFSET_Y,
  };
};

export const toTextRevealIndicatorValues = (indicator) => {
  const source = indicator && typeof indicator === "object" ? indicator : {};

  return {
    ...source,
    revealing: toTextRevealIndicatorVisualValues(source.revealing, source),
    complete: toTextRevealIndicatorVisualValues(source.complete, source),
  };
};

export const createTextRevealIndicatorListItems = (
  indicator,
  { copy = {} } = {},
) => {
  const values = toTextRevealIndicatorValues(indicator);
  return [
    {
      name: "indicator.revealing",
      label: copy.revealingLabel ?? "Revealing",
      kind: values.revealing.kind,
      imageId: values.revealing.imageId,
      resourceId: values.revealing.resourceId,
      animationName: values.revealing.animationName,
    },
    {
      name: "indicator.complete",
      label: copy.completeLabel ?? "Complete",
      kind: values.complete.kind,
      imageId: values.complete.imageId,
      resourceId: values.complete.resourceId,
      animationName: values.complete.animationName,
    },
  ].filter((item) => item.imageId || item.resourceId);
};

export const createTextRevealIndicatorAddItems = (
  indicator,
  { copy = {} } = {},
) => {
  const values = toTextRevealIndicatorValues(indicator);
  return TEXT_REVEAL_INDICATOR_STATE_ITEMS.filter(
    (item) => !values[item.key]?.imageId && !values[item.key]?.resourceId,
  ).map((item) => ({
    ...item,
    label: getTextRevealIndicatorStateLabel(item.key, copy),
  }));
};

export const createTextRevealIndicatorDialogDefaults = ({
  values = {},
  stateName,
} = {}) => {
  if (!isTextRevealIndicatorStateName(stateName)) {
    return {};
  }

  return toTextRevealIndicatorVisualValues(
    values.indicator?.[stateName],
    values.indicator,
  );
};

export const createTextRevealIndicatorForm = ({
  stateName,
  copy = {},
} = {}) => {
  const stateLabel = getTextRevealIndicatorStateLabel(stateName, copy);

  return {
    title:
      stateName === "revealing"
        ? (copy.revealingIndicatorTitle ?? `${stateLabel} Indicator`)
        : stateName === "complete"
          ? (copy.completeIndicatorTitle ?? `${stateLabel} Indicator`)
          : (copy.indicatorTitle ?? `${stateLabel} Indicator`),
    fields: [
      {
        type: "slot",
        slot: "text-reveal-indicator-image",
        label: copy.imageLabel ?? "Image",
      },
      {
        name: "width",
        type: "slider-with-input",
        label: copy.widthLabel ?? "Width",
        ...TEXT_REVEAL_INDICATOR_SIZE_RANGE,
        required: true,
      },
      {
        name: "height",
        type: "slider-with-input",
        label: copy.heightLabel ?? "Height",
        ...TEXT_REVEAL_INDICATOR_SIZE_RANGE,
        required: true,
      },
      {
        name: "offsetX",
        type: "slider-with-input",
        label: copy.offsetXLabel ?? "Offset X",
        ...TEXT_REVEAL_INDICATOR_OFFSET_RANGE,
      },
      {
        name: "offsetY",
        type: "slider-with-input",
        label: copy.offsetYLabel ?? "Offset Y",
        ...TEXT_REVEAL_INDICATOR_OFFSET_RANGE,
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "cancel",
          variant: "se",
          label: copy.cancelButton ?? "Cancel",
        },
        {
          id: "submit",
          variant: "pr",
          label: copy.saveButton ?? "Save",
          validate: true,
        },
      ],
    },
  };
};

// The name under the dialog's image: the image's, or the spritesheet's and
// its animation's.
export const getTextRevealIndicatorVisualName = ({
  dialog = {},
  imagesData,
  spritesheetsData,
} = {}) => {
  if (dialog.kind === "spritesheet" && dialog.resourceId) {
    const name =
      spritesheetsData?.items?.[dialog.resourceId]?.name ?? dialog.resourceId;
    return dialog.animationName ? `${name} / ${dialog.animationName}` : name;
  }
  if (dialog.imageId) {
    return imagesData?.items?.[dialog.imageId]?.name ?? dialog.imageId;
  }
  return "";
};

export const createTextRevealIndicatorVisualFromDialogValues = (
  values = {},
) => {
  const visual = {
    width: toPositiveInteger(values.width, DEFAULT_TEXT_REVEAL_INDICATOR_SIZE),
    height: toPositiveInteger(
      values.height,
      DEFAULT_TEXT_REVEAL_INDICATOR_SIZE,
    ),
    offsetX: toInteger(values.offsetX, DEFAULT_TEXT_REVEAL_INDICATOR_OFFSET_X),
    offsetY: toInteger(values.offsetY, DEFAULT_TEXT_REVEAL_INDICATOR_OFFSET_Y),
  };

  if (values.kind === "spritesheet") {
    visual.kind = "spritesheet";
    visual.resourceId = values.resourceId;
    visual.animationName = values.animationName;
    return visual;
  }

  visual.kind = "image";
  visual.imageId = values.imageId;
  return visual;
};
