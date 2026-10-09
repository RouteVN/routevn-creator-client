import {
  collectParticleTextureImageIds,
  createRenderableParticleData,
  normalizeParticleModules,
} from "./particles.js";

const PREVIEW_BACKGROUND = "#000000";
const FALLBACK_ASPECT_RATIO = "16 / 9";

const toPositiveNumber = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return undefined;
  }

  return numericValue;
};

export const formatParticleAspectRatio = (particle) => {
  const width = toPositiveNumber(particle?.width);
  const height = toPositiveNumber(particle?.height);

  if (!width || !height) {
    return FALLBACK_ASPECT_RATIO;
  }

  return `${width} / ${height}`;
};

// Whether a particle texture, as createRenderableParticleData resolves it,
// draws anything. The canvas draws no particles without one.
export const hasRenderableParticleTexture = (texture) => {
  if (typeof texture === "string") {
    return texture.length > 0;
  }

  if (texture?.shape) {
    return true;
  }

  return Array.isArray(texture?.items) && texture.items.length > 0;
};

const createPreviewBackgroundElement = ({ width, height, image } = {}) => {
  if (image?.fileId) {
    return {
      id: "particle-preview-bg",
      type: "sprite",
      src: image.fileId,
      fileType: image.fileType ?? "image/png",
      x: Math.round(width / 2),
      y: Math.round(height / 2),
      width,
      height,
      anchorX: 0.5,
      anchorY: 0.5,
    };
  }

  return {
    id: "particle-preview-bg",
    type: "rect",
    x: 0,
    y: 0,
    width,
    height,
    fill: PREVIEW_BACKGROUND,
  };
};

export const createParticlePreviewState = (
  particle = {},
  { backgroundImage } = {},
) => {
  const width = Math.max(1, Math.round(toPositiveNumber(particle.width) ?? 1));
  const height = Math.max(
    1,
    Math.round(toPositiveNumber(particle.height) ?? 1),
  );

  const element = {
    id: "particle-preview",
    type: "particles",
    x: 0,
    y: 0,
    width,
    height,
    modules: normalizeParticleModules(structuredClone(particle.modules ?? {})),
  };

  if (Number.isFinite(particle.seed)) {
    element.seed = particle.seed;
  }

  const elements = [
    createPreviewBackgroundElement({
      width,
      height,
      image: backgroundImage,
    }),
  ];

  if (hasRenderableParticleTexture(particle?.modules?.appearance?.texture)) {
    elements.push(element);
  }

  return {
    elements,
    animations: [],
  };
};

// Bump when a particle's preview starts drawing the same saved particle
// differently, so saved thumbnails are drawn again.
export const PARTICLE_THUMBNAIL_VERSION = 1;

// What a saved particle's thumbnail shows: the particle on its saved preview
// background, as the editor's Preview draws it, at the particle's own size,
// and the image files that draws.
export const createParticleThumbnailSource = ({ item, repositoryState }) => {
  const imageItems = repositoryState.images?.items ?? {};
  const effect = {
    width: item.width,
    height: item.height,
    seed: item.seed,
    modules: item.modules,
  };
  const background = imageItems[item.preview?.background?.imageId];
  const backgroundImage = background?.type === "image" ? background : undefined;
  const renderState = createParticlePreviewState(
    createRenderableParticleData(effect, imageItems),
    { backgroundImage },
  );
  const images = [];
  for (const image of [
    ...collectParticleTextureImageIds(effect, imageItems).map(
      (imageId) => imageItems[imageId],
    ),
    backgroundImage,
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
    width: Math.max(1, Math.round(toPositiveNumber(effect.width) ?? 1)),
    height: Math.max(1, Math.round(toPositiveNumber(effect.height) ?? 1)),
    renderState,
    images,
  };
};
