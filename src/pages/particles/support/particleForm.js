import {
  DEFAULT_PARTICLE_PRESET_ID,
  createParticlePresetOptions,
  createParticlePreset,
} from "./particlePresets.js";
import { isBuiltinParticleTextureName } from "../../../internal/particles.js";

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

const createParticleTagField = (copy = {}, tagOptions = []) => ({
  name: "tagIds",
  type: "tag-select",
  label: copy.tagsLabel ?? "Tags",
  placeholder: copy.selectTagsPlaceholder ?? "Select tags",
  options: tagOptions,
  addOption: {
    label: copy.addTagOption ?? "Add tag",
  },
  required: false,
});

const resolveTextureImageOptions = (imageOptions = [], copy = {}) => [
  {
    id: "",
    label:
      imageOptions.length > 0
        ? (copy.selectImageOption ?? "Select image")
        : (copy.noImagesAvailableOption ?? "No images available"),
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

const getSourceKindLabel = (kind, copy = {}) => {
  switch (kind) {
    case "point":
      return copy.sourceKindPoint ?? "Point";
    case "circle":
      return copy.sourceKindCircle ?? "Circle";
    case "line":
      return copy.sourceKindLine ?? "Line";
    case "rect":
    default:
      return copy.sourceKindRectangle ?? "Rectangle";
  }
};

const getEmissionModeLabel = (mode, copy = {}) => {
  return mode === "burst"
    ? (copy.emissionModeBurst ?? "Burst")
    : (copy.emissionModeContinuous ?? "Continuous");
};

const summarizeTexture = (texture, imageItems = {}, copy = {}) => {
  if (!texture) {
    return copy.notSetValue ?? "Not set";
  }

  if (typeof texture === "string") {
    return imageItems?.[texture]?.name ?? texture;
  }

  if (texture?.mode) {
    return `${capitalize(texture.mode)} ${copy.selectorLabel ?? "selector"}`;
  }

  return copy.legacyShapeValue ?? "Legacy shape";
};

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

const summarizeSource = (source, copy = {}) => {
  const kind = source?.kind ?? "rect";
  return getSourceKindLabel(kind, copy);
};

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

export const createParticleCreateSetupForm = ({
  imageOptions = [],
  copy = {},
} = {}) => ({
  title: copy.createParticleTitle ?? "Create Particle",
  description:
    copy.createSetupDescription ??
    "Choose a preset and texture image first. The preview updates here before you open the full editor.",
  fields: withFieldTooltips([
    {
      name: "presetId",
      type: "select",
      label: copy.presetLabel ?? "Preset",
      description:
        copy.presetDescription ??
        "Start from a ready-made particle effect profile.",
      required: true,
      clearable: false,
      options: createParticlePresetOptions(copy),
    },
    {
      name: "textureImageId",
      type: "select",
      label: copy.textureImageLabel ?? "Texture Image",
      description:
        copy.setupTextureImageDescription ??
        "Choose the image used for each spawned particle.",
      options: resolveTextureImageOptions(imageOptions, copy),
      required: true,
      clearable: false,
    },
  ]),
  actions: {
    buttons: [
      {
        id: "cancel",
        variant: "se",
        label: copy.cancelButton ?? "Cancel",
        align: "left",
      },
      {
        id: "submit",
        variant: "pr",
        label: copy.nextButton ?? "Next",
        validate: true,
      },
    ],
  },
});

export const PARTICLE_FORM_TABS = [
  { id: "basics", label: "Basics" },
  { id: "appearance", label: "Appearance" },
  { id: "emission", label: "Emission" },
  { id: "source", label: "Source" },
  { id: "movement", label: "Movement" },
];

export const createParticleFormTabs = (copy = {}) => [
  { id: "basics", label: copy.basicsTab ?? "Basics" },
  { id: "appearance", label: copy.appearanceTab ?? "Appearance" },
  { id: "emission", label: copy.emissionTab ?? "Emission" },
  { id: "source", label: copy.sourceTab ?? "Source" },
  { id: "movement", label: copy.movementTab ?? "Movement" },
];

const PARTICLE_FORM_TAB_IDS = new Set(
  PARTICLE_FORM_TABS.map((item) => item.id),
);

const createParticleFieldsByTab = ({
  imageOptions = [],
  tagOptions = [],
  copy = {},
} = {}) => {
  const fieldsByTab = {
    basics: [
      {
        type: "read-only-text",
        content:
          copy.basicsHelpText ??
          "Pick a texture image and adjust the main emitter fields. Preset values were applied before opening this form.",
      },
      {
        name: "name",
        type: "input-text",
        label: copy.nameLabel ?? "Name",
        description:
          copy.nameDescription ??
          "Give this particle effect a name for the resource list.",
        required: true,
      },
      {
        name: "description",
        type: "input-textarea",
        label: copy.descriptionLabel ?? "Description",
        description:
          copy.descriptionDescription ??
          "Optional notes about where or how this effect should be used.",
        required: false,
      },
      createParticleTagField(copy, tagOptions),
      {
        name: "width",
        type: "input-number",
        label: copy.widthLabel ?? "Width",
        description:
          copy.widthDescription ??
          "Set the particle preview and effect canvas width in pixels.",
        min: 1,
        step: 1,
        required: true,
      },
      {
        name: "height",
        type: "input-number",
        label: copy.heightLabel ?? "Height",
        description:
          copy.heightDescription ??
          "Set the particle preview and effect canvas height in pixels.",
        min: 1,
        step: 1,
        required: true,
      },
      {
        name: "seed",
        type: "input-number",
        label: copy.seedLabel ?? "Seed",
        description:
          copy.seedDescription ??
          "Use a fixed random seed to make the effect replay consistently.",
        step: 1,
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
      },
      {
        name: "emissionRate",
        type: "input-number",
        label: copy.emissionRateLabel ?? "Rate / second",
        description:
          copy.emissionRateDescription ??
          "How many particles spawn each second in continuous mode.",
        min: 0,
        step: 1,
        required: false,
        $when: "emissionMode == 'continuous'",
      },
      {
        name: "burstCount",
        type: "input-number",
        label: copy.burstCountLabel ?? "Burst Count",
        description:
          copy.burstCountDescription ??
          "How many particles spawn each time a burst is emitted.",
        min: 1,
        step: 1,
        required: true,
        $when: "emissionMode == 'burst'",
      },
      {
        name: "maxActive",
        type: "input-number",
        label: copy.maxActiveLabel ?? "Max Active",
        description:
          copy.maxActiveDescription ??
          "Limit how many particles can exist at the same time.",
        min: 1,
        step: 1,
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
        $when: "emissionMode == 'continuous'",
      },
      {
        name: "durationSeconds",
        type: "input-number",
        label: copy.durationSecondsLabel ?? "Duration Seconds",
        description:
          copy.durationSecondsDescription ??
          "How long emission lasts when using timed duration.",
        min: 0,
        step: 0.1,
        required: false,
        $when: "emissionMode == 'continuous' && durationMode == 'timed'",
      },
      {
        name: "lifetimeMin",
        type: "input-number",
        label: copy.lifetimeMinLabel ?? "Lifetime Min",
        description:
          copy.lifetimeMinDescription ??
          "Shortest lifetime a spawned particle can have, in seconds.",
        min: 0,
        step: 0.1,
        required: true,
      },
      {
        name: "lifetimeMax",
        type: "input-number",
        label: copy.lifetimeMaxLabel ?? "Lifetime Max",
        description:
          copy.lifetimeMaxDescription ??
          "Longest lifetime a spawned particle can have, in seconds.",
        min: 0,
        step: 0.1,
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
      },
      {
        name: "sourceX",
        type: "input-number",
        label: copy.sourceXLabel ?? "Source X",
        description:
          copy.sourceXDescription ??
          "Horizontal start position of the emitter shape.",
        step: 1,
        required: false,
      },
      {
        name: "sourceY",
        type: "input-number",
        label: copy.sourceYLabel ?? "Source Y",
        description:
          copy.sourceYDescription ??
          "Vertical start position of the emitter shape.",
        step: 1,
        required: false,
      },
      {
        name: "sourceWidth",
        type: "input-number",
        label: copy.sourceWidthLabel ?? "Source Width",
        description:
          copy.sourceWidthDescription ?? "Width of the rectangle emitter area.",
        min: 0,
        step: 1,
        required: false,
        $when: "sourceKind == 'rect'",
      },
      {
        name: "sourceHeight",
        type: "input-number",
        label: copy.sourceHeightLabel ?? "Source Height",
        description:
          copy.sourceHeightDescription ??
          "Height of the rectangle emitter area.",
        min: 0,
        step: 1,
        required: false,
        $when: "sourceKind == 'rect'",
      },
      {
        name: "sourceRadius",
        type: "input-number",
        label: copy.sourceRadiusLabel ?? "Source Radius",
        description:
          copy.sourceRadiusDescription ??
          "Outer radius of the circle emitter area.",
        min: 0,
        step: 1,
        required: false,
        $when: "sourceKind == 'circle'",
      },
      {
        name: "sourceInnerRadius",
        type: "input-number",
        label: copy.sourceInnerRadiusLabel ?? "Inner Radius",
        description:
          copy.sourceInnerRadiusDescription ??
          "Optional inner gap for ring-shaped circle emitters.",
        min: 0,
        step: 1,
        required: false,
        $when: "sourceKind == 'circle'",
      },
      {
        name: "sourceX2",
        type: "input-number",
        label: copy.lineX2Label ?? "Line X2",
        description:
          copy.lineX2Description ??
          "Horizontal end position for line emitters.",
        step: 1,
        required: false,
        $when: "sourceKind == 'line'",
      },
      {
        name: "sourceY2",
        type: "input-number",
        label: copy.lineY2Label ?? "Line Y2",
        description:
          copy.lineY2Description ?? "Vertical end position for line emitters.",
        step: 1,
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
      },
      {
        name: "speedMin",
        type: "input-number",
        label: copy.speedMinLabel ?? "Speed Min",
        description:
          copy.speedMinDescription ?? "Minimum launch speed for new particles.",
        min: 0,
        step: 1,
        required: false,
      },
      {
        name: "speedMax",
        type: "input-number",
        label: copy.speedMaxLabel ?? "Speed Max",
        description:
          copy.speedMaxDescription ?? "Maximum launch speed for new particles.",
        min: 0,
        step: 1,
        required: false,
      },
      {
        name: "directionMin",
        type: "input-number",
        label: copy.directionMinLabel ?? "Direction / Angle Min",
        description:
          copy.directionMinDescription ??
          "Starting minimum direction or angle for particle movement.",
        step: 1,
        required: false,
      },
      {
        name: "directionMax",
        type: "input-number",
        label: copy.directionMaxLabel ?? "Direction / Angle Max",
        description:
          copy.directionMaxDescription ??
          "Starting maximum direction or angle for particle movement.",
        step: 1,
        required: false,
      },
      {
        name: "accelerationX",
        type: "input-number",
        label: copy.accelerationXLabel ?? "Acceleration X",
        description:
          copy.accelerationXDescription ??
          "Horizontal acceleration applied over each particle's lifetime.",
        step: 1,
        required: false,
      },
      {
        name: "accelerationY",
        type: "input-number",
        label: copy.accelerationYLabel ?? "Acceleration Y",
        description:
          copy.accelerationYDescription ??
          "Vertical acceleration applied over each particle's lifetime.",
        step: 1,
        required: false,
      },
      {
        name: "maxSpeed",
        type: "input-number",
        label: copy.maxSpeedLabel ?? "Max Speed",
        description:
          copy.maxSpeedDescription ??
          "Clamp particle speed so acceleration does not exceed this limit.",
        min: 0,
        step: 1,
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
        required: true,
        clearable: false,
      },
    ],
    appearance: [
      {
        name: "textureImageId",
        type: "select",
        label: copy.textureImageLabel ?? "Texture Image",
        description:
          copy.textureImageDescription ??
          "Choose the image used to draw each particle sprite.",
        options: resolveTextureImageOptions(imageOptions, copy),
        required: true,
      },
      {
        name: "scaleMin",
        type: "input-number",
        label: copy.scaleMinLabel ?? "Scale Min",
        description:
          copy.scaleMinDescription ??
          "Minimum particle scale at spawn or across the preset range.",
        min: 0,
        step: 0.05,
        required: false,
      },
      {
        name: "scaleMax",
        type: "input-number",
        label: copy.scaleMaxLabel ?? "Scale Max",
        description:
          copy.scaleMaxDescription ??
          "Maximum particle scale at spawn or across the preset range.",
        min: 0,
        step: 0.05,
        required: false,
      },
    ],
  };

  return Object.fromEntries(
    Object.entries(fieldsByTab).map(([tab, fields]) => [
      tab,
      withFieldTooltips(fields),
    ]),
  );
};

export const createParticleForm = ({
  editMode = false,
  imageOptions = [],
  tagOptions = [],
  activeTab = "basics",
  copy = {},
} = {}) => ({
  title: editMode
    ? (copy.editParticleTitle ?? "Edit Particle")
    : (copy.addParticleTitle ?? "Add Particle"),
  fields: [
    {
      type: "slot",
      slot: "particle-form-tabs",
    },
    ...createParticleFieldsByTab({
      imageOptions,
      tagOptions,
      copy,
    })[PARTICLE_FORM_TAB_IDS.has(activeTab) ? activeTab : "basics"],
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: editMode
          ? (copy.updateParticleButton ?? "Update Particle")
          : (copy.addParticleButton ?? "Add Particle"),
        validate: true,
      },
    ],
  },
});

export const resolveParticleBaseData = ({
  particle,
  presetId,
  projectResolution,
  copy,
} = {}) => {
  if (presetId) {
    return createParticlePreset({
      presetId,
      projectResolution,
      copy,
    });
  }

  if (particle) {
    return structuredClone(particle);
  }

  return createParticlePreset({
    presetId: DEFAULT_PARTICLE_PRESET_ID,
    projectResolution,
    copy,
  });
};

export const buildParticleFormValues = ({
  particle,
  presetId = "",
  projectResolution,
  copy,
} = {}) => {
  const resolvedParticle = resolveParticleBaseData({
    particle,
    presetId: presetId || undefined,
    projectResolution,
    copy,
  });
  const modules = resolvedParticle.modules ?? {};
  const emission = modules.emission ?? {};
  const movement = modules.movement ?? {};
  const appearance = modules.appearance ?? {};
  const lifetime = resolveRange(emission.particleLifetime, 1, 2);
  const scale = resolveScaleRange(appearance.scale);
  const textureFields = resolveTextureFields(appearance.texture);
  const sourceValues = resolveSourceValues(resolvedParticle, emission.source);
  const movementValues = resolveMovementValues(movement);

  return {
    presetId,
    name: resolvedParticle.name ?? "",
    description: resolvedParticle.description ?? "",
    tagIds: resolvedParticle.tagIds ?? [],
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
  const emissionMode = values?.emissionMode ?? "continuous";
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
    modules.emission.burstCount = Math.max(
      1,
      Math.round(toPositiveNumber(values?.burstCount, 1)),
    );
    delete modules.emission.rate;
    delete modules.emission.maxActive;
    delete modules.emission.duration;
  } else {
    modules.emission.maxActive = Math.max(
      1,
      Math.round(toPositiveNumber(values?.maxActive, 60)),
    );
    modules.emission.duration =
      durationMode === "timed"
        ? Math.max(
            0,
            toNonNegativeNumber(values?.durationSeconds, fallbackTimedDuration),
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

  const payload = {
    name: values?.name?.trim() ?? "",
    description: values?.description ?? "",
    width,
    height,
    seed: values?.seed === "" ? null : (toOptionalNumber(values?.seed) ?? null),
    modules,
  };
  const tagIds = Array.isArray(values?.tagIds)
    ? values.tagIds.filter(Boolean)
    : [];
  if (tagIds.length > 0) {
    payload.tagIds = tagIds;
  }

  return payload;
};

export const buildParticleDetailFields = (input) => {
  const item = input?.item ?? input;
  const imagesData = input?.imagesData;
  const copy = input?.copy ?? {};
  if (!item) {
    return [];
  }

  const texture = item.modules?.appearance?.texture;
  const textureImageItem = resolveParticleTextureImageItem(
    texture,
    imagesData?.items,
  );
  const textureImageField = textureImageItem?.fileId
    ? {
        type: "slot",
        slot: "particle-texture-image",
        label: copy.textureImageLabel ?? "Texture Image",
      }
    : {
        type: "text",
        label: copy.textureImageLabel ?? "Texture Image",
        value: summarizeTexture(texture, imagesData?.items, copy),
      };

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
      type: "slot",
      slot: "particle-tags",
      label: copy.tagsLabel ?? "Tags",
    },
    {
      type: "text",
      label: copy.canvasSizeLabel ?? "Canvas Size",
      value: formatDimensionLabel(item.width ?? 0, item.height ?? 0),
    },
    {
      type: "text",
      label: copy.emissionLabel ?? "Emission",
      value: getEmissionModeLabel(item.modules?.emission?.mode, copy),
    },
    {
      type: "text",
      label: copy.sourceLabel ?? "Source",
      value: summarizeSource(item.modules?.emission?.source, copy),
    },
    textureImageField,
    {
      type: "text",
      label: copy.seedLabel ?? "Seed",
      value: toTextValue(item.seed),
    },
  ];
};

export const buildParticleCatalogItem = (item) => ({
  id: item.id,
  name: item.name,
  cardKind: "layout",
  cardVariant: "thumbnail",
  previewFileId: item.thumbnailFileId,
});
