import { toFlatItems } from "./project/tree.js";

// route-graphics sizes its particle pool from these counts: 1,000,000 or more
// hangs the webview for over a minute, and above about 20,000 a burst drops
// below 40 fps in WebKit. The shipped presets use 60 to 240.
export const MAX_PARTICLE_COUNT = 20000;
// A rate of 1,000,000,000 per second runs at 3 fps and 1e20 hangs the webview;
// 1,000,000 still renders at full speed.
export const MAX_PARTICLE_RATE = 100000;

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// route-graphics rejects a range whose min is greater than its max.
const swapReversedRanges = (value) => {
  if (Array.isArray(value)) {
    value.forEach(swapReversedRanges);
    return;
  }
  if (!isPlainObject(value)) {
    return;
  }
  if (
    Number.isFinite(value.min) &&
    Number.isFinite(value.max) &&
    value.min > value.max
  ) {
    [value.min, value.max] = [value.max, value.min];
  }
  Object.values(value).forEach(swapReversedRanges);
};

// Repairs, in place, every value that route-graphics rejects or that hangs the
// webview and that the model's shallow validation lets through: reversed
// ranges, a negative max speed, an inner radius outside 0..radius, and
// oversized counts or rates. It runs when the form saves and again when a
// saved particle is rendered, so data saved earlier is repaired without being
// rewritten. Callers pass a copy.
export const normalizeParticleModules = (modules) => {
  if (!isPlainObject(modules)) {
    return modules;
  }

  const emission = modules.emission;
  if (isPlainObject(emission)) {
    for (const key of ["maxActive", "burstCount"]) {
      if (
        typeof emission[key] === "number" &&
        emission[key] > MAX_PARTICLE_COUNT
      ) {
        emission[key] = MAX_PARTICLE_COUNT;
      }
    }
    if (
      typeof emission.rate === "number" &&
      emission.rate > MAX_PARTICLE_RATE
    ) {
      emission.rate = MAX_PARTICLE_RATE;
    }
    const source = emission.source;
    if (
      source?.kind === "circle" &&
      isPlainObject(source.data) &&
      Number.isFinite(source.data.radius) &&
      Number.isFinite(source.data.innerRadius)
    ) {
      source.data.innerRadius = Math.min(
        Math.max(source.data.innerRadius, 0),
        source.data.radius,
      );
    }
  }

  const movement = modules.movement;
  if (isPlainObject(movement) && Number.isFinite(movement.maxSpeed)) {
    movement.maxSpeed = Math.max(movement.maxSpeed, 0);
  }

  swapReversedRanges(modules);
  return modules;
};

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

// The image a particle texture draws: the texture's image, or the first
// image of a texture that picks between several. Built-in shapes have none.
export const resolveParticleTextureImageItem = (texture, imageItems = {}) => {
  if (typeof texture === "string") {
    if (isBuiltinParticleTextureName(texture)) {
      return;
    }

    const imageItem = imageItems?.[texture];
    return imageItem?.type === "image" ? imageItem : undefined;
  }

  if (!texture || typeof texture !== "object" || Array.isArray(texture)) {
    return;
  }

  const firstItem = Array.isArray(texture.items)
    ? texture.items.find((item) => item?.src)
    : undefined;

  if (!firstItem?.src) {
    return;
  }

  return resolveParticleTextureImageItem(firstItem.src, imageItems);
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
  normalizeParticleModules(nextParticle.modules);
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
