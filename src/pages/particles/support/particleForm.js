import {
  DEFAULT_PARTICLE_PRESET_ID,
  PARTICLE_PRESET_OPTIONS,
  createParticlePreset,
} from "./particlePresets.js";
import { isBuiltinParticleTextureName } from "../../../internal/particles.js";

const EMISSION_MODE_OPTIONS = [
  { id: "continuous", label: "Continuous", value: "continuous" },
  { id: "burst", label: "Burst", value: "burst" },
];

const DURATION_MODE_OPTIONS = [
  { id: "infinite", label: "Infinite", value: "infinite" },
  { id: "timed", label: "Timed", value: "timed" },
];

const SOURCE_KIND_OPTIONS = [
  { id: "point", label: "Point", value: "point" },
  { id: "rect", label: "Rectangle", value: "rect" },
  { id: "circle", label: "Circle", value: "circle" },
  { id: "line", label: "Line", value: "line" },
];

const VELOCITY_KIND_OPTIONS = [
  { id: "directional", label: "Directional", value: "directional" },
  { id: "radial", label: "Radial", value: "radial" },
];

const BOUNDS_MODE_OPTIONS = [
  { id: "recycle", label: "Recycle", value: "recycle" },
  { id: "none", label: "None", value: "none" },
];

const BOUNDS_SOURCE_OPTIONS = [
  { id: "area", label: "Area", value: "area" },
  { id: "custom", label: "Custom", value: "custom" },
];

const resolveTextureImageOptions = (imageOptions = []) => [
  {
    id: "",
    label: imageOptions.length > 0 ? "Select image" : "No images available",
    value: "",
  },
  ...imageOptions,
];

const toTextValue = (value) => {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value);
};

const toOptionalNumber = (value) => {
  if (value === "" || value === undefined || value === null) {
    return undefined;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return undefined;
  }

  return numericValue;
};

const toPositiveNumber = (value, fallback) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return fallback;
  }

  return numericValue;
};

const toNonNegativeNumber = (value, fallback) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return fallback;
  }

  return numericValue;
};

const toBooleanValue = (value) => {
  if (value === true) {
    return true;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }

  return false;
};

const resolveRange = (value, fallbackMin, fallbackMax = fallbackMin) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return {
      min: value,
      max: value,
    };
  }

  const min = Number(value?.min);
  const max = Number(value?.max);
  const resolvedMin = Number.isFinite(min) ? min : fallbackMin;
  const resolvedMax = Number.isFinite(max)
    ? max
    : Number.isFinite(min)
      ? min
      : fallbackMax;

  return {
    min: resolvedMin,
    max: resolvedMax,
  };
};

const resolveCurveRange = (curve, fallbackMin, fallbackMax = fallbackMin) => {
  const keys = Array.isArray(curve?.keys) ? curve.keys : [];
  const numericValues = keys
    .map((key) => Number(key?.value))
    .filter((value) => Number.isFinite(value));

  if (numericValues.length === 0) {
    return {
      min: fallbackMin,
      max: fallbackMax,
    };
  }

  return {
    min: Math.min(...numericValues),
    max: Math.max(...numericValues),
  };
};

const resolveScaleRange = (scale) => {
  if (scale?.mode === "curve") {
    return resolveCurveRange(scale, 0.4, 1);
  }

  if (scale?.mode === "single") {
    const value = Number(scale.value);
    return {
      min: Number.isFinite(value) ? value : 1,
      max: Number.isFinite(value) ? value : 1,
    };
  }

  return resolveRange(scale, 0.4, 1);
};

const resolveTextureFields = (texture) => {
  if (typeof texture === "string" && isBuiltinParticleTextureName(texture)) {
    return {
      textureImageId: "",
    };
  }

  if (typeof texture === "string") {
    return {
      textureImageId: texture,
    };
  }

  const firstItem = Array.isArray(texture?.items)
    ? texture.items[0]
    : undefined;
  if (firstItem?.src) {
    return resolveTextureFields(firstItem.src);
  }

  return {
    textureImageId: "",
  };
};

const resolvePaddingValue = (padding) => {
  if (typeof padding === "number" && Number.isFinite(padding)) {
    return padding;
  }

  if (padding && typeof padding === "object") {
    const values = ["top", "right", "bottom", "left"]
      .map((key) => Number(padding[key]))
      .filter((value) => Number.isFinite(value));

    if (values.length > 0) {
      return Math.max(...values);
    }
  }

  return 24;
};

const resolveSourceDefaults = (particle) => ({
  x: Math.round((particle?.width ?? 1280) / 2),
  y: Math.round((particle?.height ?? 720) / 2),
  width: Math.round((particle?.width ?? 1280) * 0.2),
  height: 24,
  radius: 24,
  innerRadius: 0,
  x2: Math.round((particle?.width ?? 1280) / 2),
  y2: 0,
});

const resolveSourceValues = (particle, source = {}) => {
  const defaults = resolveSourceDefaults(particle);
  const data = source.data ?? {};

  return {
    sourceKind: source.kind ?? "rect",
    sourceX: toTextValue(data.x ?? data.x1 ?? defaults.x),
    sourceY: toTextValue(data.y ?? data.y1 ?? defaults.y),
    sourceWidth: toTextValue(data.width ?? defaults.width),
    sourceHeight: toTextValue(data.height ?? defaults.height),
    sourceRadius: toTextValue(data.radius ?? defaults.radius),
    sourceInnerRadius: toTextValue(data.innerRadius ?? defaults.innerRadius),
    sourceX2: toTextValue(data.x2 ?? defaults.x2),
    sourceY2: toTextValue(data.y2 ?? defaults.y2),
  };
};

const resolveMovementValues = (movement = {}) => {
  const velocity = movement.velocity ?? {
    kind: "directional",
    speed: {
      min: 0,
      max: 0,
    },
    direction: 90,
  };
  const speed = resolveRange(velocity.speed, 0, 0);
  const direction = resolveRange(
    velocity.kind === "radial" ? velocity.angle : velocity.direction,
    velocity.kind === "radial" ? 0 : 90,
    velocity.kind === "radial" ? 360 : 90,
  );

  return {
    velocityKind: velocity.kind ?? "directional",
    speedMin: toTextValue(speed.min),
    speedMax: toTextValue(speed.max),
    directionMin: toTextValue(direction.min),
    directionMax: toTextValue(direction.max),
    accelerationX: toTextValue(movement.acceleration?.x ?? 0),
    accelerationY: toTextValue(movement.acceleration?.y ?? 0),
    maxSpeed: toTextValue(movement.maxSpeed ?? 0),
    faceVelocity: Boolean(movement.faceVelocity),
  };
};

const normalizeComparable = (value) => {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (value === undefined || value === null) {
    return "";
  }

  return String(value);
};

const areFieldsEqual = (values, baseValues, fieldNames) => {
  return fieldNames.every(
    (fieldName) =>
      normalizeComparable(values?.[fieldName]) ===
      normalizeComparable(baseValues?.[fieldName]),
  );
};

const formatDimensionLabel = (width, height) => {
  return `${Math.round(width)} × ${Math.round(height)}`;
};

const capitalize = (value = "") => {
  if (!value) {
    return "";
  }

  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
};

const summarizeTexture = (texture, imageItems = {}) => {
  if (!texture) {
    return "Not set";
  }

  if (typeof texture === "string") {
    return imageItems?.[texture]?.name ?? texture;
  }

  if (texture?.mode) {
    return `${capitalize(texture.mode)} selector`;
  }

  return "Legacy shape";
};

const summarizeSource = (source) => {
  const kind = source?.kind ?? "rect";
  return capitalize(kind);
};

const summarizeLifetime = (lifetime) => {
  const range = resolveRange(lifetime, 1, 1);

  if (range.min === range.max) {
    return `${range.min}s`;
  }

  return `${range.min}s to ${range.max}s`;
};

export const createParticlePresetSelectionForm = () => ({
  title: "Choose Particle Preset",
  description:
    "Pick a starting preset. The next step opens the full editor with those values prefilled.",
  fields: [
    {
      name: "presetId",
      type: "select",
      label: "Preset",
      required: true,
      clearable: false,
      options: PARTICLE_PRESET_OPTIONS,
    },
  ],
  actions: {
    buttons: [
      {
        id: "cancel",
        variant: "se",
        label: "Cancel",
        align: "left",
      },
      {
        id: "submit",
        variant: "pr",
        label: "Continue",
        validate: true,
      },
    ],
  },
});

export const PARTICLE_FORM_TABS = [
  { id: "appearance", label: "Appearance" },
  { id: "basics", label: "Basics" },
  { id: "emission", label: "Emission" },
  { id: "source", label: "Source" },
  { id: "movement", label: "Movement" },
  { id: "bounds", label: "Bounds" },
];

const PARTICLE_FORM_TAB_IDS = new Set(
  PARTICLE_FORM_TABS.map((item) => item.id),
);

const createParticleFieldsByTab = ({ imageOptions = [] } = {}) => ({
  basics: [
    {
      type: "read-only-text",
      content:
        "Pick a texture image and adjust the main emitter fields. Preset values were applied before opening this form.",
    },
    {
      name: "name",
      type: "input-text",
      label: "Name",
      required: true,
    },
    {
      name: "description",
      type: "input-textarea",
      label: "Description",
      required: false,
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
      name: "seed",
      type: "input-number",
      label: "Seed",
      step: 1,
      required: false,
    },
  ],
  emission: [
    {
      name: "emissionMode",
      type: "select",
      label: "Emission Mode",
      options: EMISSION_MODE_OPTIONS,
      required: true,
    },
    {
      name: "emissionRate",
      type: "input-number",
      label: "Rate / second",
      min: 0,
      step: 1,
      required: false,
    },
    {
      name: "burstCount",
      type: "input-number",
      label: "Burst Count",
      min: 0,
      step: 1,
      required: false,
    },
    {
      name: "maxActive",
      type: "input-number",
      label: "Max Active",
      min: 1,
      step: 1,
      required: false,
    },
    {
      name: "durationMode",
      type: "segmented-control",
      label: "Duration",
      options: DURATION_MODE_OPTIONS,
      required: true,
    },
    {
      name: "durationSeconds",
      type: "input-number",
      label: "Duration Seconds",
      min: 0,
      step: 0.1,
      required: false,
      $when: "values.durationMode == 'timed'",
    },
    {
      name: "lifetimeMin",
      type: "input-number",
      label: "Lifetime Min",
      min: 0,
      step: 0.1,
      required: true,
    },
    {
      name: "lifetimeMax",
      type: "input-number",
      label: "Lifetime Max",
      min: 0,
      step: 0.1,
      required: true,
    },
  ],
  source: [
    {
      name: "sourceKind",
      type: "select",
      label: "Source Shape",
      options: SOURCE_KIND_OPTIONS,
      required: true,
    },
    {
      name: "sourceX",
      type: "input-number",
      label: "Source X",
      step: 1,
      required: false,
    },
    {
      name: "sourceY",
      type: "input-number",
      label: "Source Y",
      step: 1,
      required: false,
    },
    {
      name: "sourceWidth",
      type: "input-number",
      label: "Source Width",
      min: 0,
      step: 1,
      required: false,
    },
    {
      name: "sourceHeight",
      type: "input-number",
      label: "Source Height",
      min: 0,
      step: 1,
      required: false,
    },
    {
      name: "sourceRadius",
      type: "input-number",
      label: "Source Radius",
      min: 0,
      step: 1,
      required: false,
    },
    {
      name: "sourceInnerRadius",
      type: "input-number",
      label: "Inner Radius",
      min: 0,
      step: 1,
      required: false,
    },
    {
      name: "sourceX2",
      type: "input-number",
      label: "Line X2",
      step: 1,
      required: false,
    },
    {
      name: "sourceY2",
      type: "input-number",
      label: "Line Y2",
      step: 1,
      required: false,
    },
  ],
  movement: [
    {
      name: "velocityKind",
      type: "select",
      label: "Velocity Type",
      options: VELOCITY_KIND_OPTIONS,
      required: true,
    },
    {
      name: "speedMin",
      type: "input-number",
      label: "Speed Min",
      min: 0,
      step: 1,
      required: false,
    },
    {
      name: "speedMax",
      type: "input-number",
      label: "Speed Max",
      min: 0,
      step: 1,
      required: false,
    },
    {
      name: "directionMin",
      type: "input-number",
      label: "Direction / Angle Min",
      step: 1,
      required: false,
    },
    {
      name: "directionMax",
      type: "input-number",
      label: "Direction / Angle Max",
      step: 1,
      required: false,
    },
    {
      name: "accelerationX",
      type: "input-number",
      label: "Acceleration X",
      step: 1,
      required: false,
    },
    {
      name: "accelerationY",
      type: "input-number",
      label: "Acceleration Y",
      step: 1,
      required: false,
    },
    {
      name: "maxSpeed",
      type: "input-number",
      label: "Max Speed",
      min: 0,
      step: 1,
      required: false,
    },
    {
      name: "faceVelocity",
      type: "checkbox",
      content: "Rotate particles toward movement",
      required: false,
    },
  ],
  appearance: [
    {
      name: "textureImageId",
      type: "select",
      label: "Texture Image",
      options: resolveTextureImageOptions(imageOptions),
      required: true,
    },
    {
      name: "scaleMin",
      type: "input-number",
      label: "Scale Min",
      min: 0,
      step: 0.05,
      required: false,
    },
    {
      name: "scaleMax",
      type: "input-number",
      label: "Scale Max",
      min: 0,
      step: 0.05,
      required: false,
    },
  ],
  bounds: [
    {
      name: "boundsMode",
      type: "select",
      label: "Bounds Mode",
      options: BOUNDS_MODE_OPTIONS,
      required: true,
    },
    {
      name: "boundsSource",
      type: "select",
      label: "Bounds Source",
      options: BOUNDS_SOURCE_OPTIONS,
      required: false,
    },
    {
      name: "boundsPadding",
      type: "input-number",
      label: "Bounds Padding",
      min: 0,
      step: 1,
      required: false,
    },
    {
      name: "customX",
      type: "input-number",
      label: "Custom Bounds X",
      step: 1,
      required: false,
    },
    {
      name: "customY",
      type: "input-number",
      label: "Custom Bounds Y",
      step: 1,
      required: false,
    },
    {
      name: "customWidth",
      type: "input-number",
      label: "Custom Bounds Width",
      min: 0,
      step: 1,
      required: false,
    },
    {
      name: "customHeight",
      type: "input-number",
      label: "Custom Bounds Height",
      min: 0,
      step: 1,
      required: false,
    },
  ],
});

export const createParticleForm = ({
  editMode = false,
  imageOptions = [],
  activeTab = "basics",
} = {}) => ({
  title: editMode ? "Edit Particle" : "Add Particle",
  fields: [
    {
      type: "slot",
      slot: "particle-form-tabs",
    },
    ...createParticleFieldsByTab({
      imageOptions,
    })[PARTICLE_FORM_TAB_IDS.has(activeTab) ? activeTab : "basics"],
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: editMode ? "Update Particle" : "Add Particle",
      },
    ],
  },
});

export const resolveParticleBaseData = ({
  particle,
  presetId,
  projectResolution,
} = {}) => {
  if (presetId) {
    return createParticlePreset({
      presetId,
      projectResolution,
    });
  }

  if (particle) {
    return structuredClone(particle);
  }

  return createParticlePreset({
    presetId: DEFAULT_PARTICLE_PRESET_ID,
    projectResolution,
  });
};

export const buildParticleFormValues = ({
  particle,
  presetId = "",
  projectResolution,
} = {}) => {
  const resolvedParticle = resolveParticleBaseData({
    particle,
    presetId: presetId || undefined,
    projectResolution,
  });
  const modules = resolvedParticle.modules ?? {};
  const emission = modules.emission ?? {};
  const movement = modules.movement ?? {};
  const appearance = modules.appearance ?? {};
  const bounds = modules.bounds ?? {};
  const lifetime = resolveRange(emission.particleLifetime, 1, 2);
  const scale = resolveScaleRange(appearance.scale);
  const textureFields = resolveTextureFields(appearance.texture);
  const sourceValues = resolveSourceValues(resolvedParticle, emission.source);
  const movementValues = resolveMovementValues(movement);

  return {
    name: resolvedParticle.name ?? "",
    description: resolvedParticle.description ?? "",
    width: toTextValue(resolvedParticle.width ?? 1280),
    height: toTextValue(resolvedParticle.height ?? 720),
    seed: toTextValue(resolvedParticle.seed),
    emissionMode: emission.mode ?? "continuous",
    emissionRate: toTextValue(emission.rate ?? 20),
    burstCount: toTextValue(emission.burstCount ?? 8),
    maxActive: toTextValue(emission.maxActive ?? 60),
    durationMode:
      emission.duration === undefined || emission.duration === "infinite"
        ? "infinite"
        : "timed",
    durationSeconds:
      emission.duration === undefined || emission.duration === "infinite"
        ? ""
        : toTextValue(emission.duration),
    lifetimeMin: toTextValue(lifetime.min),
    lifetimeMax: toTextValue(lifetime.max),
    ...sourceValues,
    ...movementValues,
    ...textureFields,
    scaleMin: toTextValue(scale.min),
    scaleMax: toTextValue(scale.max),
    boundsMode: bounds.mode ?? "recycle",
    boundsSource: bounds.source ?? "area",
    boundsPadding: toTextValue(resolvePaddingValue(bounds.padding)),
    customX: toTextValue(bounds.custom?.x ?? 0),
    customY: toTextValue(bounds.custom?.y ?? 0),
    customWidth: toTextValue(
      bounds.custom?.width ?? resolvedParticle.width ?? 1280,
    ),
    customHeight: toTextValue(
      bounds.custom?.height ?? resolvedParticle.height ?? 720,
    ),
  };
};

const buildTextureDefinition = (values = {}) => {
  const textureImageId = `${values.textureImageId ?? ""}`.trim();
  return textureImageId || undefined;
};

const buildScaleDefinition = (values = {}) => {
  const min = toNonNegativeNumber(values.scaleMin, 0.4);
  const max = toNonNegativeNumber(values.scaleMax, min);

  if (min === max) {
    return {
      mode: "single",
      value: min,
    };
  }

  return {
    mode: "range",
    min,
    max,
  };
};

const buildSourceDefinition = ({ values, width, height }) => {
  const sourceKind = values.sourceKind ?? "rect";
  const defaultWidth = Math.max(1, Math.round(width * 0.2));
  const defaultHeight = 24;

  if (sourceKind === "point") {
    return {
      kind: "point",
      data: {
        x: toOptionalNumber(values.sourceX) ?? Math.round(width / 2),
        y: toOptionalNumber(values.sourceY) ?? Math.round(height / 2),
      },
    };
  }

  if (sourceKind === "circle") {
    const radius = toPositiveNumber(values.sourceRadius, 24);
    const innerRadius = toOptionalNumber(values.sourceInnerRadius) ?? 0;

    return {
      kind: "circle",
      data: {
        x: toOptionalNumber(values.sourceX) ?? Math.round(width / 2),
        y: toOptionalNumber(values.sourceY) ?? Math.round(height / 2),
        radius,
        innerRadius: Math.min(innerRadius, radius),
      },
    };
  }

  if (sourceKind === "line") {
    return {
      kind: "line",
      data: {
        x1: toOptionalNumber(values.sourceX) ?? 0,
        y1: toOptionalNumber(values.sourceY) ?? 0,
        x2: toOptionalNumber(values.sourceX2) ?? width,
        y2: toOptionalNumber(values.sourceY2) ?? 0,
      },
    };
  }

  return {
    kind: "rect",
    data: {
      x:
        toOptionalNumber(values.sourceX) ??
        Math.round((width - defaultWidth) / 2),
      y: toOptionalNumber(values.sourceY) ?? 0,
      width: toPositiveNumber(values.sourceWidth, defaultWidth),
      height: toPositiveNumber(values.sourceHeight, defaultHeight),
    },
  };
};

const buildMovementDefinition = (values = {}) => {
  const velocityKind = values.velocityKind ?? "directional";
  const speedMin = toNonNegativeNumber(values.speedMin, 0);
  const speedMax = toNonNegativeNumber(values.speedMax, speedMin);
  const angleMin =
    toOptionalNumber(values.directionMin) ??
    (velocityKind === "radial" ? 0 : 90);
  const angleMax =
    toOptionalNumber(values.directionMax) ??
    (velocityKind === "radial" ? 360 : angleMin);

  const velocity = {
    kind: velocityKind,
    speed:
      speedMin === speedMax
        ? speedMin
        : {
            min: speedMin,
            max: speedMax,
          },
  };

  if (velocityKind === "radial") {
    velocity.angle =
      angleMin === angleMax
        ? angleMin
        : {
            min: angleMin,
            max: angleMax,
          };
  } else {
    velocity.direction =
      angleMin === angleMax
        ? angleMin
        : {
            min: angleMin,
            max: angleMax,
          };
  }

  return {
    velocity,
    acceleration: {
      x: toOptionalNumber(values.accelerationX) ?? 0,
      y: toOptionalNumber(values.accelerationY) ?? 0,
    },
    maxSpeed: toOptionalNumber(values.maxSpeed) ?? 0,
    faceVelocity: toBooleanValue(values.faceVelocity),
  };
};

const buildBoundsDefinition = ({ values, width, height }) => {
  const boundsMode = values.boundsMode ?? "recycle";
  if (boundsMode === "none") {
    return {
      mode: "none",
    };
  }

  const boundsSource = values.boundsSource ?? "area";
  const bounds = {
    mode: "recycle",
    source: boundsSource,
  };

  if (boundsSource === "custom") {
    bounds.custom = {
      x: toOptionalNumber(values.customX) ?? 0,
      y: toOptionalNumber(values.customY) ?? 0,
      width: toPositiveNumber(values.customWidth, width),
      height: toPositiveNumber(values.customHeight, height),
    };
    return bounds;
  }

  bounds.padding = toNonNegativeNumber(values.boundsPadding, 24);
  return bounds;
};

export const buildParticlePayload = ({
  values,
  baseParticle,
  projectResolution,
} = {}) => {
  const resolvedBaseParticle = resolveParticleBaseData({
    particle: baseParticle,
    presetId: undefined,
    projectResolution,
  });
  const baseValues = buildParticleFormValues({
    particle: resolvedBaseParticle,
    presetId: "",
    projectResolution,
  });

  const width = Math.max(
    1,
    Math.round(toPositiveNumber(values?.width, resolvedBaseParticle.width)),
  );
  const height = Math.max(
    1,
    Math.round(toPositiveNumber(values?.height, resolvedBaseParticle.height)),
  );
  const modules = structuredClone(resolvedBaseParticle.modules ?? {});
  const emissionRate = Number(values?.emissionRate);
  const durationMode = values?.durationMode ?? "infinite";
  const resolvedBaseDuration = resolvedBaseParticle.modules?.emission?.duration;
  const fallbackTimedDuration =
    typeof resolvedBaseDuration === "number" &&
    Number.isFinite(resolvedBaseDuration)
      ? Math.max(0, resolvedBaseDuration)
      : 1;

  modules.emission = {
    ...modules.emission,
    mode: values?.emissionMode ?? "continuous",
    maxActive: Math.max(1, Math.round(toPositiveNumber(values?.maxActive, 60))),
    duration:
      durationMode === "timed"
        ? Math.max(
            0,
            toNonNegativeNumber(values?.durationSeconds, fallbackTimedDuration),
          )
        : "infinite",
    particleLifetime: {
      min: Math.max(0, toNonNegativeNumber(values?.lifetimeMin, 1)),
      max: Math.max(
        0,
        toNonNegativeNumber(
          values?.lifetimeMax,
          toNonNegativeNumber(values?.lifetimeMin, 1),
        ),
      ),
    },
    source: buildSourceDefinition({
      values,
      width,
      height,
    }),
  };

  if (modules.emission.mode === "burst") {
    modules.emission.burstCount = Math.max(
      1,
      Math.round(toPositiveNumber(values?.burstCount, 1)),
    );
    delete modules.emission.rate;
  } else {
    modules.emission.rate = Number.isFinite(emissionRate)
      ? Math.max(1, emissionRate)
      : 20;
    delete modules.emission.burstCount;
  }

  modules.movement = buildMovementDefinition(values);
  modules.bounds = buildBoundsDefinition({
    values,
    width,
    height,
  });
  modules.appearance = {
    ...modules.appearance,
  };

  if (
    areFieldsEqual(values, baseValues, ["textureImageId"]) &&
    resolvedBaseParticle.modules?.appearance?.texture !== undefined
  ) {
    modules.appearance.texture = structuredClone(
      resolvedBaseParticle.modules.appearance.texture,
    );
  } else {
    const textureDefinition = buildTextureDefinition(values);
    if (textureDefinition === undefined) {
      delete modules.appearance.texture;
    } else {
      modules.appearance.texture = textureDefinition;
    }
  }

  if (
    areFieldsEqual(values, baseValues, ["scaleMin", "scaleMax"]) &&
    resolvedBaseParticle.modules?.appearance?.scale !== undefined
  ) {
    modules.appearance.scale = structuredClone(
      resolvedBaseParticle.modules.appearance.scale,
    );
  } else {
    modules.appearance.scale = buildScaleDefinition(values);
  }

  return {
    name: values?.name?.trim() ?? "",
    description: values?.description ?? "",
    width,
    height,
    seed: values?.seed === "" ? null : (toOptionalNumber(values?.seed) ?? null),
    modules,
  };
};

export const buildParticleDetailFields = (input) => {
  const item = input?.item ?? input;
  const imagesData = input?.imagesData;
  if (!item) {
    return [];
  }

  return [
    {
      type: "slot",
      slot: "particle-preview",
      label: "",
    },
    {
      type: "description",
      value: item.description ?? "",
    },
    {
      type: "text",
      label: "Canvas Size",
      value: formatDimensionLabel(item.width ?? 0, item.height ?? 0),
    },
    {
      type: "text",
      label: "Emission",
      value: capitalize(item.modules?.emission?.mode ?? "continuous"),
    },
    {
      type: "text",
      label: "Source",
      value: summarizeSource(item.modules?.emission?.source),
    },
    {
      type: "text",
      label: "Texture Image",
      value: summarizeTexture(
        item.modules?.appearance?.texture,
        imagesData?.items,
      ),
    },
    {
      type: "text",
      label: "Lifetime",
      value: summarizeLifetime(item.modules?.emission?.particleLifetime),
    },
    {
      type: "text",
      label: "Max Active",
      value: toTextValue(item.modules?.emission?.maxActive ?? ""),
    },
    {
      type: "text",
      label: "Seed",
      value: toTextValue(item.seed),
    },
  ];
};

export const buildParticleCatalogItem = (item) => ({
  id: item.id,
  name: item.name,
  subtitle: `${capitalize(
    item.modules?.emission?.mode ?? "continuous",
  )} • ${formatDimensionLabel(item.width ?? 0, item.height ?? 0)}`,
});
