import { toFlatItems } from "./project/tree.js";

const SPRITESHEET_SELECTION_SEPARATOR = "::";
export const INITIAL_SPRITESHEET_CLIP_FPS = 24;

export const normalizeSpritesheetFps = (value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const fps = Number(value);
  if (!Number.isFinite(fps) || fps <= 0) {
    return undefined;
  }

  return fps;
};

export const formatSpritesheetFps = (value) => {
  const fps = normalizeSpritesheetFps(value);
  if (fps === undefined) {
    return "";
  }

  return Number.isInteger(fps)
    ? String(fps)
    : fps.toFixed(2).replace(/\.?0+$/, "");
};

export const resolveSpritesheetAnimationFps = (
  animation = {},
  missingClipFps = INITIAL_SPRITESHEET_CLIP_FPS,
) => {
  const explicitFps = normalizeSpritesheetFps(animation?.fps);
  if (explicitFps !== undefined) {
    return explicitFps;
  }

  const animationSpeed = Number(animation?.animationSpeed);
  if (Number.isFinite(animationSpeed) && animationSpeed > 0) {
    return animationSpeed * 60;
  }

  return (
    normalizeSpritesheetFps(missingClipFps) ?? INITIAL_SPRITESHEET_CLIP_FPS
  );
};

export const resolveSpritesheetFrameName = (frameNames = [], frameRef) => {
  if (typeof frameRef === "string" && frameRef.length > 0) {
    return frameNames.includes(frameRef) ? frameRef : undefined;
  }

  if (Number.isInteger(frameRef)) {
    return frameNames[frameRef];
  }

  return undefined;
};

// Default Width and Height are optional, but Route Graphics cannot draw a
// spritesheet without a size. A missing one falls back to the size the import
// fills in: the first clip's first frame, or else the whole sheet.
export const resolveSpritesheetSize = (spritesheet = {}) => {
  const frames = spritesheet.jsonData?.frames ?? {};
  const frameNames = Object.keys(frames);
  const firstClip = Object.values(spritesheet.animations ?? {})[0];
  const frameName =
    resolveSpritesheetFrameName(frameNames, firstClip?.frames?.[0]) ??
    frameNames[0];
  const frame = frames[frameName];

  return {
    width:
      spritesheet.width ??
      frame?.sourceSize?.w ??
      frame?.frame?.w ??
      spritesheet.sheetWidth,
    height:
      spritesheet.height ??
      frame?.sourceSize?.h ??
      frame?.frame?.h ??
      spritesheet.sheetHeight,
  };
};

export const normalizeSpritesheetAnimationsFps = (
  animations = {},
  missingClipFps = INITIAL_SPRITESHEET_CLIP_FPS,
) => {
  return Object.fromEntries(
    Object.entries(animations ?? {}).map(([name, animation]) => {
      const normalizedAnimation = {
        ...animation,
        fps: resolveSpritesheetAnimationFps(animation, missingClipFps),
      };
      delete normalizedAnimation.animationSpeed;
      return [name, normalizedAnimation];
    }),
  );
};

const getSpritesheetAnimationNames = (item = {}) => {
  return Object.keys(item.animations ?? {});
};

export const toSpritesheetAnimationSelectionValue = (
  resourceId,
  animationName,
) => {
  if (
    typeof resourceId !== "string" ||
    resourceId.length === 0 ||
    typeof animationName !== "string" ||
    animationName.length === 0
  ) {
    return "";
  }

  return `${resourceId}${SPRITESHEET_SELECTION_SEPARATOR}${animationName}`;
};

export const parseSpritesheetAnimationSelectionValue = (value) => {
  if (typeof value !== "string" || value.length === 0) {
    return {};
  }

  const separatorIndex = value.indexOf(SPRITESHEET_SELECTION_SEPARATOR);
  if (separatorIndex <= 0) {
    return {};
  }

  const resourceId = value.slice(0, separatorIndex);
  const animationName = value.slice(
    separatorIndex + SPRITESHEET_SELECTION_SEPARATOR.length,
  );

  if (!resourceId || !animationName) {
    return {};
  }

  return {
    resourceId,
    animationName,
  };
};

export const toSpritesheetAnimationSelectionItems = (spritesheetsData = {}) => {
  return toFlatItems(spritesheetsData)
    .filter((item) => item.type === "spritesheet")
    .flatMap((item) =>
      getSpritesheetAnimationNames(item).map((animationName) => ({
        label: `${item.name} / ${animationName}`,
        value: toSpritesheetAnimationSelectionValue(item.id, animationName),
        resourceId: item.id,
        animationName,
      })),
    );
};

export const getFirstSpritesheetAnimationSelectionValue = (
  spritesheetsData = {},
) => {
  return toSpritesheetAnimationSelectionItems(spritesheetsData)[0]?.value ?? "";
};

export const getSpritesheetAnimationPreview = (
  spritesheetsData = {},
  resourceId,
  animationName,
) => {
  const spritesheet = spritesheetsData?.items?.[resourceId];
  if (
    spritesheet?.type !== "spritesheet" ||
    typeof spritesheet.fileId !== "string" ||
    !spritesheet.jsonData
  ) {
    return {};
  }

  return {
    fileId: spritesheet.fileId,
    atlas: spritesheet.jsonData,
    animation: spritesheet.animations?.[animationName],
  };
};

export const getSpritesheetResourceDefaultSize = (
  spritesheetsData = {},
  resourceId,
) => {
  const spritesheet = spritesheetsData?.items?.[resourceId];
  if (spritesheet?.type !== "spritesheet") {
    return {};
  }

  return {
    width: spritesheet.width,
    height: spritesheet.height,
  };
};
