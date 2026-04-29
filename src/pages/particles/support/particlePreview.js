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

const hasRenderableTexture = (texture) => {
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
    modules: structuredClone(particle.modules ?? {}),
  };

  if (particle.seed !== undefined && particle.seed !== null) {
    element.seed = particle.seed;
  }

  const elements = [
    createPreviewBackgroundElement({
      width,
      height,
      image: backgroundImage,
    }),
  ];

  if (hasRenderableTexture(particle?.modules?.appearance?.texture)) {
    elements.push(element);
  }

  return {
    elements,
    animations: [],
  };
};
