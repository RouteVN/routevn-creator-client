import { resolveSpritesheetFrameName } from "../../../internal/spritesheets.js";

const DEFAULT_TEXT_REVEAL_INDICATOR_SIZE = 12;
const DEFAULT_TEXT_REVEAL_INDICATOR_OFFSET_X = 16;
const DEFAULT_TEXT_REVEAL_INDICATOR_OFFSET_Y = 0;

export const TEXT_REVEAL_INDICATOR_STATE_ITEMS = [
  { type: "item", label: "Revealing", key: "revealing" },
  { type: "item", label: "Complete", key: "complete" },
];
const TEXT_REVEAL_INDICATOR_SOUND_ITEM = {
  type: "item",
  label: "Sound",
  key: "revealSoundId",
};

const TEXT_REVEAL_INDICATOR_STATE_LABELS = {
  revealing: "Revealing",
  complete: "Complete",
};

export const isTextRevealIndicatorStateName = (value) =>
  value === "revealing" || value === "complete";

export const getTextRevealIndicatorStateLabel = (stateName) =>
  TEXT_REVEAL_INDICATOR_STATE_LABELS[stateName] ?? "Indicator";

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
  { revealSoundId } = {},
) => {
  const values = toTextRevealIndicatorValues(indicator);
  const items = [
    {
      name: "indicator.revealing",
      label: "Revealing",
      kind: values.revealing.kind,
      imageId: values.revealing.imageId,
      resourceId: values.revealing.resourceId,
      animationName: values.revealing.animationName,
    },
    {
      name: "indicator.complete",
      label: "Complete",
      kind: values.complete.kind,
      imageId: values.complete.imageId,
      resourceId: values.complete.resourceId,
      animationName: values.complete.animationName,
    },
  ].filter((item) => item.imageId || item.resourceId);

  if (revealSoundId) {
    items.push({
      name: "revealSoundId",
      label: "Sound",
      soundId: revealSoundId,
    });
  }

  return items;
};

export const createTextRevealIndicatorAddItems = (
  indicator,
  { revealSoundId, supportsTextRevealSound = false } = {},
) => {
  const values = toTextRevealIndicatorValues(indicator);
  const items = TEXT_REVEAL_INDICATOR_STATE_ITEMS.filter(
    (item) => !values[item.key]?.imageId && !values[item.key]?.resourceId,
  );

  if (supportsTextRevealSound && !revealSoundId) {
    items.push(TEXT_REVEAL_INDICATOR_SOUND_ITEM);
  }

  return items;
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

export const createTextRevealIndicatorForm = ({ stateName } = {}) => {
  const stateLabel = getTextRevealIndicatorStateLabel(stateName);

  return {
    title: `${stateLabel} Indicator`,
    fields: [
      {
        type: "slot",
        slot: "text-reveal-indicator-image",
        label: "Visual",
      },
      {
        name: "width",
        type: "input-number",
        label: "Width",
        min: 1,
        step: 1,
        required: true,
      },
      {
        name: "height",
        type: "input-number",
        label: "Height",
        min: 1,
        step: 1,
        required: true,
      },
      {
        name: "offsetX",
        type: "input-number",
        label: "Offset X",
        step: 1,
      },
      {
        name: "offsetY",
        type: "input-number",
        label: "Offset Y",
        step: 1,
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "cancel",
          variant: "se",
          label: "Cancel",
        },
        {
          id: "submit",
          variant: "pr",
          label: "Save",
          validate: true,
        },
      ],
    },
  };
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
