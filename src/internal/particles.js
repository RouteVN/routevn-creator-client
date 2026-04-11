import { toFlatItems } from "./project/tree.js";

const BUILTIN_PARTICLE_TEXTURE_NAMES = new Set([
  "circle",
  "snowflake",
  "raindrop",
]);

export const toParticleSelectionItems = (particlesData = {}) => {
  return toFlatItems(particlesData)
    .filter((item) => item.type === "particle")
    .map((item) => ({
      label: item.name,
      value: item.id,
    }));
};

export const getFirstParticleSelectionValue = (particlesData = {}) => {
  return toParticleSelectionItems(particlesData)[0]?.value ?? "";
};

export const toParticleTextureImageOptions = (imagesData = {}) => {
  return toFlatItems(imagesData)
    .filter((item) => item.type === "image")
    .map((item) => ({
      label: item.name,
      value: item.id,
    }));
};

export const isBuiltinParticleTextureName = (value) => {
  return typeof value === "string" && BUILTIN_PARTICLE_TEXTURE_NAMES.has(value);
};

const resolveParticleTextureForRender = (texture, imageItems = {}) => {
  if (typeof texture === "string") {
    if (isBuiltinParticleTextureName(texture)) {
      return texture;
    }

    const image = imageItems?.[texture];
    if (typeof image?.fileId === "string" && image.fileId.length > 0) {
      return image.fileId;
    }

    return undefined;
  }

  if (!texture || typeof texture !== "object" || Array.isArray(texture)) {
    return texture;
  }

  if (!Array.isArray(texture.items)) {
    return texture;
  }

  const items = texture.items
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return undefined;
      }

      if (typeof item.src !== "string") {
        return item;
      }

      const src = resolveParticleTextureForRender(item.src, imageItems);
      if (!src) {
        return undefined;
      }

      return {
        ...item,
        src,
      };
    })
    .filter(Boolean);

  if (items.length === 0) {
    return undefined;
  }

  return {
    ...texture,
    items,
  };
};

export const createRenderableParticleData = (
  particle = {},
  imageItems = {},
) => {
  const nextParticle = structuredClone(particle ?? {});
  const appearance = nextParticle?.modules?.appearance;

  if (!appearance || typeof appearance !== "object") {
    return nextParticle;
  }

  const resolvedTexture = resolveParticleTextureForRender(
    appearance.texture,
    imageItems,
  );

  if (resolvedTexture === undefined) {
    delete appearance.texture;
  } else {
    appearance.texture = resolvedTexture;
  }

  return nextParticle;
};

const collectParticleTextureImageIdsFromTexture = (
  texture,
  imageItems = {},
  imageIds,
) => {
  if (typeof texture === "string") {
    if (!isBuiltinParticleTextureName(texture) && imageItems?.[texture]) {
      imageIds.add(texture);
    }
    return;
  }

  if (!texture || typeof texture !== "object" || Array.isArray(texture)) {
    return;
  }

  if (!Array.isArray(texture.items)) {
    return;
  }

  texture.items.forEach((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return;
    }

    if (typeof item.src === "string") {
      collectParticleTextureImageIdsFromTexture(item.src, imageItems, imageIds);
    }
  });
};

export const collectParticleTextureImageIds = (
  particle = {},
  imageItems = {},
) => {
  const imageIds = new Set();

  collectParticleTextureImageIdsFromTexture(
    particle?.modules?.appearance?.texture,
    imageItems,
    imageIds,
  );

  return Array.from(imageIds);
};

export const getParticleResourceDefaultSize = (
  particlesData = {},
  particleId,
) => {
  const particle = particlesData?.items?.[particleId];
  if (particle?.type !== "particle") {
    return {
      width: undefined,
      height: undefined,
    };
  }

  return {
    width: particle.width,
    height: particle.height,
  };
};
