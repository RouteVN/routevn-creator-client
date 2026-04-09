import { toFlatItems } from "./project/tree.js";

const SPRITESHEET_SELECTION_SEPARATOR = "::";

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
        label: `${item.fullLabel || item.name} / ${animationName}`,
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
