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

const isNumber = (value) => typeof value === "number" && !Number.isNaN(value);

const toParticleCount = (value) =>
  Math.min(MAX_PARTICLE_COUNT, Math.max(1, Math.round(value)));

const isValidDuration = (value) =>
  value === undefined ||
  value === "infinite" ||
  (isNumber(value) && value >= 0);

// route-graphics checks Max Active and the duration in both emission modes,
// the rate only for a continuous effect, and Burst Count only for a burst. A
// value it rejects becomes what the particle editor form saves when it loads
// that value, so the effect draws as it will after its next edit. A value the
// mode ignores is not repaired here, so an effect that already draws keeps its
// render state and its thumbnail.
const repairEmissionForMode = (emission) => {
  if (emission.mode === "continuous") {
    if (!isNumber(emission.rate)) {
      emission.rate = 20;
    } else if (emission.rate <= 0) {
      emission.rate = 1;
    }
    if (emission.maxActive !== undefined) {
      emission.maxActive =
        isNumber(emission.maxActive) && emission.maxActive > 0
          ? toParticleCount(emission.maxActive)
          : 60;
    }
    if (!isValidDuration(emission.duration)) {
      // The form saves 0 for a negative duration and 1 second for one that is
      // not a number. Like a saved 0, a repaired 0 never stops emitting.
      emission.duration = isNumber(emission.duration) ? 0 : 1;
    }
    return;
  }

  if (emission.mode === "burst") {
    emission.burstCount = isNumber(emission.burstCount)
      ? toParticleCount(emission.burstCount)
      : 8;
    // The form saves neither for a burst.
    if (emission.maxActive !== undefined) {
      if (isNumber(emission.maxActive) && emission.maxActive > 0) {
        emission.maxActive = toParticleCount(emission.maxActive);
      } else {
        delete emission.maxActive;
      }
    }
    if (!isValidDuration(emission.duration)) {
      delete emission.duration;
    }
  }
};

// Repairs, in place, values that route-graphics rejects or that hang the
// webview and that the model's shallow validation lets through: reversed
// ranges, a negative max speed, an inner radius outside 0..radius, oversized
// counts or rates, and a rate, count or duration that the emission mode uses
// but that is missing where required, not a number, or out of range. It runs
// when the form saves and again when a saved particle is rendered, so data
// saved earlier, imported or synced is repaired without being rewritten.
// Callers pass a copy.
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
    repairEmissionForMode(emission);
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

const PARTICLE_TEXTURE_MODES = new Set(["single", "random", "cycle"]);
const PARTICLE_TEXTURE_PICKS = new Set(["perParticle", "perWave"]);
const PARTICLE_TEXTURE_SHAPES = new Set(["circle", "ellipse", "rect"]);

const isOptionalNumber = (value) =>
  value === undefined || (typeof value === "number" && !Number.isNaN(value));

const isRenderableTextureShape = (texture) =>
  PARTICLE_TEXTURE_SHAPES.has(texture.shape) &&
  isOptionalNumber(texture.radius) &&
  isOptionalNumber(texture.width) &&
  isOptionalNumber(texture.height) &&
  (texture.color === undefined ||
    typeof texture.color === "string" ||
    typeof texture.color === "number");

const isRenderableTextureItem = (item) => {
  if (!isPlainObject(item)) {
    return false;
  }
  if (item.src !== undefined) {
    return typeof item.src === "string" && item.src.length > 0;
  }
  return Boolean(item.shape) && isRenderableTextureShape(item);
};

// Whether route-graphics draws a particle with this texture, as
// createRenderableParticleData resolves it. It throws for any other value,
// such as no texture, one whose image is gone, or an imported texture without
// a mode, and that fails every render of the scene. Layouts, visuals and
// previews draw nothing for such a particle instead.
export const isRenderableParticleTexture = (texture) => {
  if (typeof texture === "string") {
    return texture.length > 0;
  }
  if (!isPlainObject(texture)) {
    return false;
  }
  if (texture.shape) {
    return isRenderableTextureShape(texture);
  }
  if (
    !PARTICLE_TEXTURE_MODES.has(texture.mode) ||
    (texture.pick !== undefined && !PARTICLE_TEXTURE_PICKS.has(texture.pick)) ||
    !Array.isArray(texture.items) ||
    texture.items.length === 0 ||
    (texture.mode === "single" && texture.items.length !== 1)
  ) {
    return false;
  }
  return texture.items.every(isRenderableTextureItem);
};

export const createRenderableParticleData = (
  particle = {},
  imageItems = {},
) => {
  const nextParticle = structuredClone(particle ?? {});
  normalizeParticleModules(nextParticle.modules);
  // route-graphics rejects a seed that is not a number, such as a blank Seed
  // field saved as null, and draws an unseeded effect without one.
  if (!Number.isFinite(nextParticle.seed)) {
    delete nextParticle.seed;
  }
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
