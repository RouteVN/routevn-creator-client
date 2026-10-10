import {
  MAX_PARTICLE_COUNT,
  MAX_PARTICLE_RATE,
  isBuiltinParticleTextureName,
  normalizeParticleModules,
} from "../../../internal/particles.js";

const createEmissionModeOptions = (copy = {}) => [
  {
    id: "continuous",
    label: copy.emissionModeContinuous ?? "Continuous",
    value: "continuous",
  },
  { id: "burst", label: copy.emissionModeBurst ?? "Burst", value: "burst" },
];

const createDurationModeOptions = (copy = {}) => [
  {
    id: "infinite",
    label: copy.durationModeInfinite ?? "Infinite",
    value: "infinite",
  },
  { id: "timed", label: copy.durationModeTimed ?? "Timed", value: "timed" },
];

const createOpacityModeOptions = (copy = {}) => [
  { id: "fixed", label: copy.opacityModeFixed ?? "Fixed", value: "fixed" },
  { id: "curve", label: copy.opacityModeCurve ?? "Curve", value: "curve" },
];

const createSourceKindOptions = (copy = {}) => [
  { id: "point", label: copy.sourceKindPoint ?? "Point", value: "point" },
  {
    id: "rect",
    label: copy.sourceKindRectangle ?? "Rectangle",
    value: "rect",
  },
  { id: "circle", label: copy.sourceKindCircle ?? "Circle", value: "circle" },
  { id: "line", label: copy.sourceKindLine ?? "Line", value: "line" },
];

const createVelocityKindOptions = (copy = {}) => [
  {
    id: "directional",
    label: copy.velocityKindDirectional ?? "Directional",
    value: "directional",
  },
  { id: "radial", label: copy.velocityKindRadial ?? "Radial", value: "radial" },
];

const createFaceVelocityOptions = (copy = {}) => [
  { id: "off", label: copy.offLabel ?? "Off", value: false },
  { id: "on", label: copy.onLabel ?? "On", value: true },
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

const DEFAULT_OPACITY_FADE_PERCENT = 10;

const clampUnit = (value) => Math.min(1, Math.max(0, value));

// Saved times and values keep 4 decimals, so arithmetic leaves no float noise.
const roundOpacityNumber = (value) => Math.round(value * 10000) / 10000;

const toLifetimePercent = (time) => Math.round(clampUnit(time) * 1000) / 10;

// Saved data can come from imports or other clients, so keep only usable keys,
// in time order, within 0-1.
const readOpacityCurveKeys = (alpha) =>
  (Array.isArray(alpha?.keys) ? alpha.keys : [])
    .map((key) => ({ time: Number(key?.time), value: Number(key?.value) }))
    .filter((key) => Number.isFinite(key.time) && Number.isFinite(key.value))
    .map((key) => ({ time: clampUnit(key.time), value: clampUnit(key.value) }))
    .sort((a, b) => a.time - b.time);

const readOpacityCurve = (alpha) => {
  if (alpha?.mode !== "curve") {
    return undefined;
  }
  const keys = readOpacityCurveKeys(alpha);
  if (keys.length === 0) {
    return undefined;
  }
  const peak = resolveCurveRange({ keys }, 1).max;
  const visibleKeys = keys.filter((key) => key.value > 0);
  return {
    keys,
    peak,
    peakStart: keys.find((key) => key.value === peak)?.time ?? 0,
    fadeOutStart: visibleKeys[visibleKeys.length - 1]?.time ?? 1,
  };
};

// The form shows an opacity curve as fade in, peak, fade out: the shape the
// presets use.
const resolveOpacityValues = (alpha) => {
  const curve = readOpacityCurve(alpha);
  if (!curve) {
    const value = Number(alpha?.value);
    return {
      opacityMode: "fixed",
      opacity: toTextValue(Number.isFinite(value) ? clampUnit(value) : 1),
      opacityFadeIn: toTextValue(DEFAULT_OPACITY_FADE_PERCENT),
      opacityFadeOut: toTextValue(DEFAULT_OPACITY_FADE_PERCENT),
    };
  }

  return {
    opacityMode: "curve",
    opacity: toTextValue(curve.peak),
    opacityFadeIn: toTextValue(toLifetimePercent(curve.peakStart)),
    opacityFadeOut: toTextValue(toLifetimePercent(1 - curve.fadeOutStart)),
  };
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

// Whether two sets of form values show the same, however their numbers are
// written ("64" or 64).
export const areParticleFormValuesEqual = (values, otherValues) =>
  areFieldsEqual(
    values,
    otherValues,
    Object.keys({ ...values, ...otherValues }),
  );

// The fields that decide which other fields show (their `$when`). rtgl-form
// fills in only the fields that show when it mounts, so it remounts when one
// of these changes.
export const PARTICLE_FORM_CONDITION_FIELDS = Object.freeze([
  "emissionMode",
  "durationMode",
  "sourceKind",
  "opacityMode",
]);

const withFieldTooltips = (fields = []) =>
  fields.map((field) => {
    if (!field || typeof field !== "object" || Array.isArray(field)) {
      return field;
    }

    const description = field.description;
    if (!description) {
      return field;
    }

    const { description: _description, ...rest } = field;

    return {
      ...rest,
      tooltip: field.tooltip ?? {
        content: description,
      },
    };
  });

// The name, description and tags are edited on the particles page, so the
// form holds the effect only.
const createParticleFieldsBySection = ({ copy = {} } = {}) => {
  const fieldsBySection = {
    basics: [
      {
        name: "width",
        type: "slot",
        slot: "particle-slider-width",
        label: copy.widthLabel ?? "Width",
        description:
          copy.widthDescription ??
          "Set the particle preview and effect canvas width in pixels.",
        required: true,
      },
      {
        name: "height",
        type: "slot",
        slot: "particle-slider-height",
        label: copy.heightLabel ?? "Height",
        description:
          copy.heightDescription ??
          "Set the particle preview and effect canvas height in pixels.",
        required: true,
      },
      {
        name: "seed",
        type: "slot",
        slot: "particle-slider-seed",
        label: copy.seedLabel ?? "Seed",
        description:
          copy.seedDescription ??
          "Use a fixed random seed to make the effect replay consistently.",
        required: false,
      },
    ],
    emission: [
      {
        name: "emissionMode",
        type: "select",
        label: copy.emissionModeLabel ?? "Emission Mode",
        description:
          copy.emissionModeDescription ??
          "Choose whether particles spawn continuously or in bursts.",
        options: createEmissionModeOptions(copy),
        required: true,
        clearable: false,
      },
      {
        name: "emissionRate",
        type: "slot",
        slot: "particle-slider-emissionRate",
        label: copy.emissionRateLabel ?? "Rate / second",
        description:
          copy.emissionRateDescription ??
          "How many particles spawn each second in continuous mode.",
        required: false,
        $when: "emissionMode == 'continuous'",
      },
      {
        name: "burstCount",
        type: "slot",
        slot: "particle-slider-burstCount",
        label: copy.burstCountLabel ?? "Burst Count",
        description:
          copy.burstCountDescription ??
          "How many particles spawn each time a burst is emitted.",
        required: true,
        $when: "emissionMode == 'burst'",
      },
      {
        name: "maxActive",
        type: "slot",
        slot: "particle-slider-maxActive",
        label: copy.maxActiveLabel ?? "Max Active",
        description:
          copy.maxActiveDescription ??
          "Limit how many particles can exist at the same time.",
        required: false,
        $when: "emissionMode == 'continuous'",
      },
      {
        name: "durationMode",
        type: "segmented-control",
        label: copy.durationLabel ?? "Duration",
        description:
          copy.durationDescription ??
          "Keep emitting forever or stop after a timed window.",
        options: createDurationModeOptions(copy),
        required: true,
        clearable: false,
        $when: "emissionMode == 'continuous'",
      },
      {
        name: "durationSeconds",
        type: "slot",
        slot: "particle-slider-durationSeconds",
        label: copy.durationSecondsLabel ?? "Duration Seconds",
        description:
          copy.durationSecondsDescription ??
          "How long emission lasts when using timed duration.",
        required: false,
        $when: "emissionMode == 'continuous' && durationMode == 'timed'",
      },
      {
        name: "lifetimeMin",
        type: "slot",
        slot: "particle-slider-lifetimeMin",
        label: copy.lifetimeMinLabel ?? "Lifetime Min",
        description:
          copy.lifetimeMinDescription ??
          "Shortest lifetime a spawned particle can have, in seconds.",
        required: true,
      },
      {
        name: "lifetimeMax",
        type: "slot",
        slot: "particle-slider-lifetimeMax",
        label: copy.lifetimeMaxLabel ?? "Lifetime Max",
        description:
          copy.lifetimeMaxDescription ??
          "Longest lifetime a spawned particle can have, in seconds.",
        required: true,
      },
    ],
    source: [
      {
        name: "sourceKind",
        type: "select",
        label: copy.sourceShapeLabel ?? "Source Shape",
        description:
          copy.sourceShapeDescription ??
          "Choose the emitter shape particles spawn from.",
        options: createSourceKindOptions(copy),
        required: true,
        clearable: false,
      },
      {
        name: "sourceX",
        type: "slot",
        slot: "particle-slider-sourceX",
        label: copy.sourceXLabel ?? "Source X",
        description:
          copy.sourceXDescription ??
          "Horizontal start position of the emitter shape.",
        required: false,
      },
      {
        name: "sourceY",
        type: "slot",
        slot: "particle-slider-sourceY",
        label: copy.sourceYLabel ?? "Source Y",
        description:
          copy.sourceYDescription ??
          "Vertical start position of the emitter shape.",
        required: false,
      },
      {
        name: "sourceWidth",
        type: "slot",
        slot: "particle-slider-sourceWidth",
        label: copy.sourceWidthLabel ?? "Source Width",
        description:
          copy.sourceWidthDescription ?? "Width of the rectangle emitter area.",
        required: false,
        $when: "sourceKind == 'rect'",
      },
      {
        name: "sourceHeight",
        type: "slot",
        slot: "particle-slider-sourceHeight",
        label: copy.sourceHeightLabel ?? "Source Height",
        description:
          copy.sourceHeightDescription ??
          "Height of the rectangle emitter area.",
        required: false,
        $when: "sourceKind == 'rect'",
      },
      {
        name: "sourceRadius",
        type: "slot",
        slot: "particle-slider-sourceRadius",
        label: copy.sourceRadiusLabel ?? "Source Radius",
        description:
          copy.sourceRadiusDescription ??
          "Outer radius of the circle emitter area.",
        required: false,
        $when: "sourceKind == 'circle'",
      },
      {
        name: "sourceInnerRadius",
        type: "slot",
        slot: "particle-slider-sourceInnerRadius",
        label: copy.sourceInnerRadiusLabel ?? "Inner Radius",
        description:
          copy.sourceInnerRadiusDescription ??
          "Optional inner gap for ring-shaped circle emitters.",
        required: false,
        $when: "sourceKind == 'circle'",
      },
      {
        name: "sourceX2",
        type: "slot",
        slot: "particle-slider-sourceX2",
        label: copy.lineX2Label ?? "Line X2",
        description:
          copy.lineX2Description ??
          "Horizontal end position for line emitters.",
        required: false,
        $when: "sourceKind == 'line'",
      },
      {
        name: "sourceY2",
        type: "slot",
        slot: "particle-slider-sourceY2",
        label: copy.lineY2Label ?? "Line Y2",
        description:
          copy.lineY2Description ?? "Vertical end position for line emitters.",
        required: false,
        $when: "sourceKind == 'line'",
      },
    ],
    movement: [
      {
        name: "velocityKind",
        type: "select",
        label: copy.velocityTypeLabel ?? "Velocity Type",
        description:
          copy.velocityTypeDescription ??
          "Move particles in one direction or spread them radially.",
        options: createVelocityKindOptions(copy),
        required: true,
        clearable: false,
      },
      {
        name: "speedMin",
        type: "slot",
        slot: "particle-slider-speedMin",
        label: copy.speedMinLabel ?? "Speed Min",
        description:
          copy.speedMinDescription ?? "Minimum launch speed for new particles.",
        required: false,
      },
      {
        name: "speedMax",
        type: "slot",
        slot: "particle-slider-speedMax",
        label: copy.speedMaxLabel ?? "Speed Max",
        description:
          copy.speedMaxDescription ?? "Maximum launch speed for new particles.",
        required: false,
      },
      {
        name: "directionMin",
        type: "slot",
        slot: "particle-slider-directionMin",
        label: copy.directionMinLabel ?? "Direction / Angle Min",
        description:
          copy.directionMinDescription ??
          "Starting minimum direction or angle for particle movement.",
        required: false,
      },
      {
        name: "directionMax",
        type: "slot",
        slot: "particle-slider-directionMax",
        label: copy.directionMaxLabel ?? "Direction / Angle Max",
        description:
          copy.directionMaxDescription ??
          "Starting maximum direction or angle for particle movement.",
        required: false,
      },
      {
        name: "accelerationX",
        type: "slot",
        slot: "particle-slider-accelerationX",
        label: copy.accelerationXLabel ?? "Acceleration X",
        description:
          copy.accelerationXDescription ??
          "Horizontal acceleration applied over each particle's lifetime.",
        required: false,
      },
      {
        name: "accelerationY",
        type: "slot",
        slot: "particle-slider-accelerationY",
        label: copy.accelerationYLabel ?? "Acceleration Y",
        description:
          copy.accelerationYDescription ??
          "Vertical acceleration applied over each particle's lifetime.",
        required: false,
      },
      {
        name: "maxSpeed",
        type: "slot",
        slot: "particle-slider-maxSpeed",
        label: copy.maxSpeedLabel ?? "Max Speed",
        description:
          copy.maxSpeedDescription ??
          "Clamp particle speed so acceleration does not exceed this limit.",
        required: false,
      },
      {
        name: "faceVelocity",
        type: "segmented-control",
        label: copy.faceVelocityLabel ?? "Rotate Toward Movement",
        description:
          copy.faceVelocityDescription ??
          "Turn each particle so it points in the direction it is moving.",
        options: createFaceVelocityOptions(copy),
        required: false,
        clearable: false,
      },
    ],
    appearance: [
      {
        type: "slot",
        slot: "particle-texture-image",
      },
      {
        name: "scaleMin",
        type: "slot",
        slot: "particle-slider-scaleMin",
        label: copy.scaleMinLabel ?? "Scale Min",
        description:
          copy.scaleMinDescription ??
          "Minimum particle scale at spawn or across the preset range.",
        required: false,
      },
      {
        name: "scaleMax",
        type: "slot",
        slot: "particle-slider-scaleMax",
        label: copy.scaleMaxLabel ?? "Scale Max",
        description:
          copy.scaleMaxDescription ??
          "Maximum particle scale at spawn or across the preset range.",
        required: false,
      },
      {
        name: "opacityMode",
        type: "segmented-control",
        label: copy.opacityLabel ?? "Opacity",
        description:
          copy.opacityModeDescription ??
          "Keep one opacity for each particle's whole life, or fade it in and out.",
        options: createOpacityModeOptions(copy),
        required: true,
        clearable: false,
      },
      {
        name: "opacity",
        type: "slot",
        slot: "particle-slider-opacity",
        label: copy.opacityValueLabel ?? "Opacity Value",
        description:
          copy.opacityValueDescription ??
          "From 0 (invisible) to 1 (fully visible). With Curve, this is the highest opacity reached.",
        required: false,
      },
      {
        name: "opacityFadeIn",
        type: "slot",
        slot: "particle-slider-opacityFadeIn",
        label: copy.opacityFadeInLabel ?? "Fade In %",
        description:
          copy.opacityFadeInDescription ??
          "Share of each particle's lifetime spent fading in from invisible.",
        required: false,
        $when: "opacityMode == 'curve'",
      },
      {
        name: "opacityFadeOut",
        type: "slot",
        slot: "particle-slider-opacityFadeOut",
        label: copy.opacityFadeOutLabel ?? "Fade Out %",
        description:
          copy.opacityFadeOutDescription ??
          "Share of each particle's lifetime spent fading out at the end.",
        required: false,
        $when: "opacityMode == 'curve'",
      },
    ],
  };

  return Object.fromEntries(
    Object.entries(fieldsBySection).map(([section, fields]) => [
      section,
      withFieldTooltips(fields),
    ]),
  );
};

// The slots of the fields edited with a slider popover.
const PARTICLE_SLIDER_SLOT_PREFIX = "particle-slider-";

const toPixelPresets = (values) =>
  values.map((value) => ({ label: `${value} px`, value }));

const toSecondPresets = (values) =>
  values.map((value) => ({ label: `${value} s`, value }));

const toDegreePresets = (values) =>
  values.map((value) => ({ label: `${value}°`, value }));

const toNumberPresets = (values) =>
  values.map((value) => ({ label: `${value}`, value }));

// Opacity reads as a percentage, with its value beside it.
const toOpacityPresets = (values) =>
  values.map((value) => ({
    label: `${Math.round(value * 100)}%`,
    value,
    suffixText: `${value}`,
  }));

const CANVAS_SHARES = [
  { label: "0", ratio: 0 },
  { label: "1/4", ratio: 1 / 4 },
  { label: "1/2", ratio: 1 / 2 },
  { label: "3/4", ratio: 3 / 4 },
  { label: "1", ratio: 1 },
];

// Shares of a canvas length, with their pixels beside them.
const toCanvasSharePresets = (length, { leaveOutZero = false } = {}) =>
  CANVAS_SHARES.filter((share) => !leaveOutZero || share.ratio > 0).map(
    (share) => {
      const value = Math.round(length * share.ratio);
      return { label: share.label, value, suffixText: `${value} px` };
    },
  );

// A typed position or size of the source reaches this many times the
// particle's canvas.
const CANVAS_BOUND_MULTIPLE = 4;

// The fields the form edits with a slider popover (see
// src/internal/ui/sliderPopover.js): the steps are `step` and the larger
// `fastStep`, `range` is where the slider runs, and `min` and `max` bound a
// typed value. The source's position and size go with the particle's own
// canvas, `width` by `height`.
const createParticleSliderFields = ({ copy = {}, width, height }) => {
  const bound = (length) => Math.round(length * CANVAS_BOUND_MULTIPLE);
  const radius = Math.round(Math.min(width, height) / 2);
  const position = (length) => ({
    step: 1,
    fastStep: 10,
    min: -bound(length),
    max: bound(length),
    range: { min: 0, max: length },
    unit: "px",
    presets: toCanvasSharePresets(length),
  });
  const size = (length) => ({
    step: 1,
    fastStep: 10,
    min: 0,
    max: bound(length),
    range: { min: 0, max: length },
    unit: "px",
    presets: toCanvasSharePresets(length, { leaveOutZero: true }),
  });
  const radiusField = ({ leaveOutZero }) => ({
    step: 1,
    fastStep: 10,
    min: 0,
    max: bound(Math.max(width, height)),
    range: { min: 0, max: radius },
    unit: "px",
    presets: toCanvasSharePresets(radius, { leaveOutZero }),
  });
  const scale = {
    defaultValue: 1,
    step: 0.05,
    fastStep: 0.25,
    min: 0,
    max: 10,
    range: { min: 0, max: 2 },
    presets: toNumberPresets([0.1, 0.25, 0.5, 1, 1.5, 2]),
  };
  const fade = {
    defaultValue: DEFAULT_OPACITY_FADE_PERCENT,
    step: 1,
    fastStep: 10,
    min: 0,
    max: 100,
    presets: [0, 10, 20, 30, 50].map((value) => ({
      label: `${value}%`,
      value,
    })),
  };
  const lifetime = {
    step: 0.1,
    fastStep: 0.5,
    min: 0,
    max: 600,
    range: { min: 0, max: 10 },
    unit: "s",
    presets: toSecondPresets([0.25, 0.5, 1, 2, 3, 5, 10]),
  };
  const speed = {
    defaultValue: 0,
    step: 1,
    fastStep: 10,
    min: 0,
    max: 10000,
    range: { min: 0, max: 1000 },
    presets: toNumberPresets([0, 50, 100, 200, 400, 800]),
  };
  const direction = {
    defaultValue: 0,
    step: 1,
    fastStep: 15,
    min: -720,
    max: 720,
    range: { min: -180, max: 180 },
    presets: toDegreePresets([-180, -135, -90, -45, 0, 45, 90, 135, 180]),
  };
  const acceleration = {
    defaultValue: 0,
    step: 1,
    fastStep: 10,
    min: -10000,
    max: 10000,
    range: { min: -1000, max: 1000 },
    presets: toNumberPresets([-500, -200, -100, 0, 100, 200, 500]),
  };

  return {
    width: {
      defaultValue: 1280,
      step: 1,
      fastStep: 10,
      min: 1,
      max: 7680,
      range: { min: 1, max: 1920 },
      unit: "px",
      presets: toPixelPresets([256, 512, 640, 960, 1280, 1920]),
    },
    height: {
      defaultValue: 720,
      step: 1,
      fastStep: 10,
      min: 1,
      max: 4320,
      range: { min: 1, max: 1080 },
      unit: "px",
      presets: toPixelPresets([256, 360, 480, 540, 720, 1080]),
    },
    // An unset seed plays differently each time; the Random preset unsets
    // it again.
    seed: {
      defaultValue: 1,
      step: 1,
      fastStep: 10,
      min: 0,
      // Seeds are 32-bit integers, often large, such as a date.
      max: 2147483647,
      range: { min: 0, max: 1000 },
      emptyText: copy.seedRandomLabel ?? "Random",
      presets: [
        { label: copy.seedRandomLabel ?? "Random", value: "" },
        ...toNumberPresets([1, 10, 100, 1000]),
      ],
    },
    scaleMin: scale,
    scaleMax: scale,
    opacity: {
      defaultValue: 1,
      step: 0.05,
      fastStep: 0.25,
      stepsAsPercent: true,
      min: 0,
      max: 1,
      presets: toOpacityPresets([0, 0.25, 0.5, 0.75, 1]),
    },
    opacityFadeIn: fade,
    opacityFadeOut: fade,
    emissionRate: {
      defaultValue: 20,
      step: 1,
      fastStep: 10,
      min: 0,
      max: MAX_PARTICLE_RATE,
      range: { min: 0, max: 200 },
      presets: toNumberPresets([1, 5, 10, 20, 50, 100, 200]),
    },
    burstCount: {
      defaultValue: 8,
      step: 1,
      fastStep: 10,
      min: 1,
      max: MAX_PARTICLE_COUNT,
      range: { min: 1, max: 200 },
      presets: toNumberPresets([1, 5, 10, 20, 50, 100, 200]),
    },
    maxActive: {
      defaultValue: 60,
      step: 1,
      fastStep: 10,
      min: 1,
      max: MAX_PARTICLE_COUNT,
      range: { min: 1, max: 1000 },
      presets: toNumberPresets([10, 30, 60, 100, 200, 500, 1000]),
    },
    durationSeconds: {
      ...lifetime,
      defaultValue: 1,
      fastStep: 1,
      presets: toSecondPresets([0.5, 1, 2, 3, 5, 10]),
    },
    lifetimeMin: { ...lifetime, defaultValue: 1 },
    lifetimeMax: { ...lifetime, defaultValue: 2 },
    sourceX: { ...position(width), defaultValue: Math.round(width / 2) },
    sourceY: { ...position(height), defaultValue: Math.round(height / 2) },
    sourceWidth: { ...size(width), defaultValue: width },
    sourceHeight: { ...size(height), defaultValue: height },
    sourceRadius: { ...radiusField({ leaveOutZero: true }), defaultValue: 0 },
    sourceInnerRadius: {
      ...radiusField({ leaveOutZero: false }),
      defaultValue: 0,
    },
    sourceX2: { ...position(width), defaultValue: width },
    sourceY2: { ...position(height), defaultValue: Math.round(height / 2) },
    speedMin: speed,
    speedMax: speed,
    directionMin: direction,
    directionMax: direction,
    accelerationX: acceleration,
    accelerationY: acceleration,
    maxSpeed: {
      defaultValue: 0,
      step: 1,
      fastStep: 10,
      min: 0,
      max: 20000,
      range: { min: 0, max: 2000 },
      presets: toNumberPresets([0, 100, 200, 500, 1000, 2000]),
    },
  };
};

// The slider value fields the page puts in the form's slots, with the
// form's values. A field the form hides, such as Burst Count while emission
// is continuous, has no slot to show in.
export const buildParticleSliderValueFields = ({ formValues, copy = {} }) => {
  const width = Number(formValues.width);
  const height = Number(formValues.height);
  const sliderFields = createParticleSliderFields({
    copy,
    width: width > 0 ? width : 1280,
    height: height > 0 ? height : 720,
  });

  return Object.values(createParticleFieldsBySection({ copy }))
    .flat()
    .filter((field) => field.slot?.startsWith(PARTICLE_SLIDER_SLOT_PREFIX))
    .map((field) => ({
      name: field.name,
      slot: field.slot,
      label: field.label,
      value: formValues[field.name],
      field: sliderFields[field.name],
    }));
};

// Edit shows every field at once, in sections, as the layout editor's panel
// does. Edits apply as they are made, so the form has no buttons.
export const createParticleForm = ({ copy = {} } = {}) => {
  const fieldsBySection = createParticleFieldsBySection({ copy });
  const createSection = (id, label) => ({
    type: "section",
    id,
    label,
    fields: fieldsBySection[id],
  });

  return {
    fields: [
      createSection("basics", copy.basicsSection ?? "Basics"),
      createSection("appearance", copy.appearanceSection ?? "Appearance"),
      createSection("emission", copy.emissionSection ?? "Emission"),
      createSection("source", copy.sourceSection ?? "Source"),
      createSection("movement", copy.movementSection ?? "Movement"),
    ],
    actions: {
      layout: "",
      buttons: [],
    },
  };
};

// The form's values for a particle's effect: its size, seed and modules.
export const buildParticleFormValues = ({ particle }) => {
  const modules = particle.modules ?? {};
  const emission = modules.emission ?? {};
  const movement = modules.movement ?? {};
  const appearance = modules.appearance ?? {};
  const lifetime = resolveRange(emission.particleLifetime, 1, 2);
  const scale = resolveScaleRange(appearance.scale);
  const textureFields = resolveTextureFields(appearance.texture);
  const sourceValues = resolveSourceValues(particle, emission.source);
  const movementValues = resolveMovementValues(movement);

  return {
    width: toTextValue(particle.width ?? 1280),
    height: toTextValue(particle.height ?? 720),
    seed: toTextValue(particle.seed),
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
    ...resolveOpacityValues(appearance.alpha),
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

const buildOpacityDefinition = ({ values, baseValues, baseAlpha }) => {
  // A cleared field means fully visible, not invisible.
  const opacity = roundOpacityNumber(
    clampUnit(toOptionalNumber(values.opacity) ?? 1),
  );
  if (values.opacityMode !== "curve") {
    return {
      mode: "single",
      value: opacity,
    };
  }

  // Changing only the peak scales the saved curve, so its shape is kept.
  const baseCurve = readOpacityCurve(baseAlpha);
  if (
    baseCurve?.peak > 0 &&
    areFieldsEqual(values, baseValues, [
      "opacityMode",
      "opacityFadeIn",
      "opacityFadeOut",
    ])
  ) {
    const scale = opacity / baseCurve.peak;
    return {
      mode: "curve",
      keys: baseCurve.keys.map((key) => ({
        time: key.time,
        value: roundOpacityNumber(clampUnit(key.value * scale)),
      })),
    };
  }

  let fadeIn =
    Math.min(100, toNonNegativeNumber(values.opacityFadeIn, 0)) / 100;
  let fadeOut =
    Math.min(100, toNonNegativeNumber(values.opacityFadeOut, 0)) / 100;
  // Fades that overlap meet at a single peak, in proportion.
  if (fadeIn + fadeOut > 1) {
    const total = fadeIn + fadeOut;
    fadeIn /= total;
    fadeOut /= total;
  }
  const fadeInEnd = roundOpacityNumber(fadeIn);
  const fadeOutStart = roundOpacityNumber(Math.max(fadeIn, 1 - fadeOut));
  const points = [
    [0, fadeInEnd > 0 ? 0 : opacity],
    [fadeInEnd, opacity],
    [fadeOutStart, opacity],
    [1, fadeOutStart < 1 ? 0 : opacity],
  ];

  return {
    mode: "curve",
    keys: points
      .filter(([time], index) => index === 0 || time !== points[index - 1][0])
      .map(([time, value]) => ({ time, value })),
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

// The effect a particle saves from the form's values: its size, seed and
// modules. `baseParticle` is the effect the values were read from. Modules
// and parts of modules the form does not show, such as bounds, rotation, or
// a preset's scale and opacity curves, are kept as they are until the
// author edits the fields that stand for them.
export const buildParticleEffectData = ({ values, baseParticle }) => {
  const baseValues = buildParticleFormValues({ particle: baseParticle });

  const width = Math.max(
    1,
    Math.round(toPositiveNumber(values?.width, baseParticle.width)),
  );
  const height = Math.max(
    1,
    Math.round(toPositiveNumber(values?.height, baseParticle.height)),
  );
  const modules = structuredClone(baseParticle.modules ?? {});
  const emissionMode = values?.emissionMode ?? "continuous";
  const emissionRate = Number(values?.emissionRate);
  const durationMode = values?.durationMode ?? "infinite";
  const resolvedBaseDuration = baseParticle.modules?.emission?.duration;
  const fallbackTimedDuration =
    typeof resolvedBaseDuration === "number" &&
    Number.isFinite(resolvedBaseDuration)
      ? Math.max(0, resolvedBaseDuration)
      : 1;

  modules.emission = {
    ...modules.emission,
    mode: emissionMode,
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
    modules.emission.burstCount = Math.min(
      MAX_PARTICLE_COUNT,
      Math.max(1, Math.round(toPositiveNumber(values?.burstCount, 1))),
    );
    delete modules.emission.rate;
    delete modules.emission.maxActive;
    delete modules.emission.duration;
  } else {
    modules.emission.maxActive = Math.min(
      MAX_PARTICLE_COUNT,
      Math.max(1, Math.round(toPositiveNumber(values?.maxActive, 60))),
    );
    // An empty duration, as when Timed is first chosen, is not 0 seconds.
    const durationSeconds =
      values?.durationSeconds === "" ? undefined : values?.durationSeconds;
    modules.emission.duration =
      durationMode === "timed"
        ? Math.max(
            0,
            toNonNegativeNumber(durationSeconds, fallbackTimedDuration),
          )
        : "infinite";
    modules.emission.rate = Number.isFinite(emissionRate)
      ? Math.max(1, emissionRate)
      : 20;
    delete modules.emission.burstCount;
  }

  modules.movement = buildMovementDefinition(values);
  modules.appearance = {
    ...modules.appearance,
  };

  if (modules.movement.faceVelocity) {
    delete modules.appearance.rotation;
  }

  if (
    areFieldsEqual(values, baseValues, ["textureImageId"]) &&
    baseParticle.modules?.appearance?.texture !== undefined
  ) {
    modules.appearance.texture = structuredClone(
      baseParticle.modules.appearance.texture,
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
    baseParticle.modules?.appearance?.scale !== undefined
  ) {
    modules.appearance.scale = structuredClone(
      baseParticle.modules.appearance.scale,
    );
  } else {
    modules.appearance.scale = buildScaleDefinition(values);
  }

  // Keep the saved opacity, including a preset curve, until the author edits
  // it. The fade fields only count while Curve is selected.
  const opacityFields =
    values?.opacityMode === "curve"
      ? ["opacityMode", "opacity", "opacityFadeIn", "opacityFadeOut"]
      : ["opacityMode", "opacity"];
  if (!areFieldsEqual(values, baseValues, opacityFields)) {
    modules.appearance.alpha = buildOpacityDefinition({
      values: values ?? {},
      baseValues,
      baseAlpha: baseParticle.modules?.appearance?.alpha,
    });
  }

  normalizeParticleModules(modules);

  // A blank seed saves as null, which removes it.
  return {
    width,
    height,
    seed: values?.seed === "" ? null : (toOptionalNumber(values?.seed) ?? null),
    modules,
  };
};

// The effect after the form changed one field, onto `effect`. `refreshForm`
// is set when the effect keeps the form's values differently from how they
// were entered, such as a width with decimals, so the form shows them as
// kept.
export const applyParticleFormChange = (effect, { name, value }) => {
  const values = {
    ...buildParticleFormValues({ particle: effect }),
    [name]: value,
  };
  const nextEffect = buildParticleEffectData({ values, baseParticle: effect });
  return {
    effect: nextEffect,
    refreshForm: !areParticleFormValuesEqual(
      values,
      buildParticleFormValues({ particle: nextEffect }),
    ),
  };
};

// The effect with its emitter source moved, as a drag on the canvas does.
export const replaceParticleSource = (effect, source) => {
  const nextEffect = structuredClone(effect);
  nextEffect.modules.emission = { ...nextEffect.modules.emission, source };
  return nextEffect;
};

// The effect with `imageId` as its texture, as the texture picker sets it.
export const replaceParticleTextureImage = (effect, imageId) => {
  const nextEffect = structuredClone(effect);
  nextEffect.modules.appearance = {
    ...nextEffect.modules.appearance,
    texture: imageId,
  };
  return nextEffect;
};
