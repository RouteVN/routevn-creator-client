import { requireProjectResolution } from "./projectResolution.js";
import { normalizeTransformValues } from "./transformValues.js";

// The canvas element the transform applies to, which the editor's selection
// outline follows.
export const TRANSFORM_PREVIEW_TARGET_ID = "transform-target";

// Bump when a transform's preview starts drawing the same saved transform
// differently, so saved thumbnails are drawn again.
export const TRANSFORM_THUMBNAIL_VERSION = 1;

const BACKGROUND_COLOR = "#4a4a4a";
// Lighter than the background and darker than the white selection outline,
// so the outline stays visible on the default target.
const TARGET_COLOR = "#a0a0a0";
const FALLBACK_TARGET_SIZE = 200;

const toPositiveNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

const createSpriteSize = (image) => ({
  width: toPositiveNumber(image.width, FALLBACK_TARGET_SIZE),
  height: toPositiveNumber(image.height, FALLBACK_TARGET_SIZE),
});

// A preview slot's image, if it still exists.
export const getTransformPreviewImage = (imagesData, imageId) => {
  if (!imageId) {
    return undefined;
  }

  const item = imagesData?.items?.[imageId];
  return item?.type === "image" ? item : undefined;
};

// A target character's sprites, in drawing order, the first at the bottom.
// A sprite that no longer exists is left out.
export const getTransformTargetCharacterSprites = (charactersData, target) => {
  const character = charactersData?.items?.[target?.characterId];
  if (character?.type !== "character") {
    return [];
  }

  return target.sprites
    .map((sprite) => character.sprites?.items?.[sprite.resourceId])
    .filter((sprite) => sprite?.type === "image" && sprite.fileId);
};

// What the transform places: a character's sprites, an image, or a light
// gray square. A character draws as scenes draw it, a container placed by
// the transform with its sprites stacked from its top-left corner, the first
// at the bottom.
const createTargetElement = ({
  targetPlacement,
  targetImage,
  targetCharacterSprites,
}) => {
  if (targetCharacterSprites?.length > 0) {
    return {
      ...targetPlacement,
      type: "container",
      children: targetCharacterSprites.map((sprite, index) => ({
        id: `${TRANSFORM_PREVIEW_TARGET_ID}-sprite-${index}`,
        type: "sprite",
        src: sprite.fileId,
        fileType: sprite.fileType ?? "image/png",
        x: 0,
        y: 0,
        ...createSpriteSize(sprite),
      })),
    };
  }

  if (targetImage?.fileId) {
    return {
      ...targetPlacement,
      type: "sprite",
      src: targetImage.fileId,
      fileType: targetImage.fileType ?? "image/png",
      ...createSpriteSize(targetImage),
    };
  }

  return {
    ...targetPlacement,
    type: "rect",
    width: FALLBACK_TARGET_SIZE,
    height: FALLBACK_TARGET_SIZE,
    fill: TARGET_COLOR,
  };
};

// The transform's preview: the background image, or a gray screen, and the
// target placed by the transform. The editor adds its selection outline on
// top on Edit; Preview and the thumbnail show it as it is.
export const createTransformPreviewRenderState = ({
  projectResolution,
  transform,
  backgroundImage,
  targetImage,
  targetCharacterSprites,
}) => {
  const { width, height } = projectResolution;
  const backgroundElement = backgroundImage?.fileId
    ? {
        id: "transform-background",
        type: "sprite",
        src: backgroundImage.fileId,
        fileType: backgroundImage.fileType ?? "image/png",
        x: Math.round(width / 2),
        y: Math.round(height / 2),
        width,
        height,
        anchorX: 0.5,
        anchorY: 0.5,
      }
    : {
        id: "transform-background",
        type: "rect",
        x: 0,
        y: 0,
        width,
        height,
        fill: BACKGROUND_COLOR,
      };
  const targetPlacement = {
    id: TRANSFORM_PREVIEW_TARGET_ID,
    x: transform.x,
    y: transform.y,
    rotation: transform.rotation,
    scaleX: transform.scaleX,
    scaleY: transform.scaleY,
    anchorX: transform.anchorX,
    anchorY: transform.anchorY,
  };
  return {
    id: "transform-editor",
    elements: [
      backgroundElement,
      createTargetElement({
        targetPlacement,
        targetImage,
        targetCharacterSprites,
      }),
    ],
    animations: [],
  };
};

// What a saved transform's thumbnail shows: its preview as saved, at the
// project's resolution, and the image files that draws.
export const createTransformThumbnailSource = ({ item, repositoryState }) => {
  const projectResolution = requireProjectResolution(
    repositoryState.project?.resolution,
    "Project resolution",
  );
  const backgroundImage = getTransformPreviewImage(
    repositoryState.images,
    item.preview?.background?.imageId,
  );
  const targetImage = getTransformPreviewImage(
    repositoryState.images,
    item.preview?.target?.imageId,
  );
  const targetCharacterSprites = getTransformTargetCharacterSprites(
    repositoryState.characters,
    item.preview?.target,
  );
  const images = [];
  for (const image of [
    backgroundImage,
    targetImage,
    ...targetCharacterSprites,
  ]) {
    if (image?.fileId) {
      images.push({
        fileId: image.fileId,
        name: image.name,
        fileType: image.fileType,
      });
    }
  }

  return {
    projectResolution,
    renderState: createTransformPreviewRenderState({
      projectResolution,
      transform: normalizeTransformValues(item),
      backgroundImage,
      targetImage,
      targetCharacterSprites,
    }),
    images,
  };
};
