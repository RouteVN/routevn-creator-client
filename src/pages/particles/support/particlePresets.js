const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;

export const DEFAULT_PARTICLE_PRESET_ID = "snow";

const PRESET_METADATA = [
  {
    id: "snow",
    label: "Snow",
    description: "Soft falling flakes across the full scene.",
  },
  {
    id: "rain",
    label: "Rain",
    description: "Fast diagonal rainfall for storm scenes.",
  },
  {
    id: "sparkle",
    label: "Sparkle",
    description: "Short-lived twinkles for magical UI moments.",
  },
];

export const PARTICLE_PRESET_OPTIONS = PRESET_METADATA.map((preset) => ({
  id: preset.id,
  label: preset.label,
  value: preset.id,
}));

const resolveDimension = (value, fallback) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return fallback;
  }

  return Math.max(1, Math.round(numericValue));
};

const resolveProjectSize = (projectResolution = {}) => {
  return {
    width: resolveDimension(projectResolution?.width, DEFAULT_WIDTH),
    height: resolveDimension(projectResolution?.height, DEFAULT_HEIGHT),
  };
};

const createRange = (min, max) => ({
  min,
  ...(max !== undefined ? { max } : {}),
});

const createCurve = (keys) => ({
  mode: "curve",
  keys: keys.map(([time, value]) => ({
    time,
    value,
  })),
});

const createSpinRotation = (minSpeed, maxSpeed) => ({
  mode: "spin",
  start: {
    min: 0,
    max: 360,
  },
  speed: {
    min: minSpeed,
    max: maxSpeed,
  },
});

const createParticle = ({
  name,
  description,
  width,
  height,
  seed,
  modules,
}) => ({
  type: "particle",
  name,
  description,
  width,
  height,
  seed,
  modules,
});

const createSnowPreset = ({ width, height }) =>
  createParticle({
    name: "Snow",
    description: "Soft full-screen snowfall.",
    width,
    height,
    seed: 20260408,
    modules: {
      emission: {
        mode: "continuous",
        rate: 64,
        maxActive: 240,
        duration: "infinite",
        particleLifetime: createRange(8.5, 12),
        source: {
          kind: "rect",
          data: {
            x: -40,
            y: -36,
            width: width + 80,
            height: 24,
          },
        },
      },
      movement: {
        velocity: {
          kind: "directional",
          direction: createRange(86, 100),
          speed: createRange(52, 92),
        },
        acceleration: {
          x: 4,
          y: 8,
        },
        maxSpeed: 120,
        faceVelocity: false,
      },
      appearance: {
        scale: {
          mode: "range",
          min: 0.18,
          max: 0.42,
        },
        alpha: createCurve([
          [0, 0],
          [0.08, 0.92],
          [0.9, 0.78],
          [1, 0],
        ]),
        rotation: createSpinRotation(-18, 18),
      },
      bounds: {
        mode: "recycle",
        source: "area",
        padding: 90,
      },
    },
  });

const createRainPreset = ({ width, height }) =>
  createParticle({
    name: "Rain",
    description: "Fast diagonal rainfall.",
    width,
    height,
    seed: 20260409,
    modules: {
      emission: {
        mode: "continuous",
        rate: 220,
        maxActive: 180,
        duration: "infinite",
        particleLifetime: createRange(1.05, 1.35),
        source: {
          kind: "rect",
          data: {
            x: -120,
            y: -80,
            width: width + 240,
            height: 48,
          },
        },
      },
      movement: {
        velocity: {
          kind: "directional",
          direction: createRange(100, 106),
          speed: createRange(720, 980),
        },
        acceleration: {
          x: 24,
          y: 60,
        },
        maxSpeed: 1100,
        faceVelocity: false,
      },
      appearance: {
        scale: {
          mode: "range",
          min: 0.24,
          max: 0.48,
        },
        alpha: {
          mode: "single",
          value: 0.72,
        },
        rotation: {
          mode: "fixed",
          value: 0,
        },
      },
      bounds: {
        mode: "recycle",
        source: "area",
        padding: 80,
      },
    },
  });

const createSparklePreset = ({ width, height }) =>
  createParticle({
    name: "Sparkle",
    description: "Short twinkling sparkles across the frame.",
    width,
    height,
    seed: 12345,
    modules: {
      emission: {
        mode: "continuous",
        rate: 18,
        maxActive: 24,
        duration: "infinite",
        particleLifetime: createRange(0.35, 0.8),
        source: {
          kind: "rect",
          data: {
            x: Math.round(width * 0.08),
            y: 0,
            width: Math.round(width * 0.84),
            height,
          },
        },
      },
      movement: {
        velocity: {
          kind: "directional",
          direction: 0,
          speed: 0,
        },
        acceleration: {
          x: 0,
          y: 0,
        },
        maxSpeed: 0,
        faceVelocity: false,
      },
      appearance: {
        scale: createCurve([
          [0, 0],
          [0.28, 1.4],
          [0.72, 1.4],
          [1, 0],
        ]),
        alpha: createCurve([
          [0, 0],
          [0.2, 1],
          [0.78, 1],
          [1, 0],
        ]),
        rotation: createSpinRotation(48, 92),
      },
      bounds: {
        mode: "recycle",
        source: "area",
        padding: 32,
      },
    },
  });

export const createParticlePreset = ({
  presetId = DEFAULT_PARTICLE_PRESET_ID,
  projectResolution,
} = {}) => {
  const { width, height } = resolveProjectSize(projectResolution);

  switch (presetId) {
    case "rain":
      return createRainPreset({ width, height });
    case "sparkle":
      return createSparklePreset({ width, height });
    case "snow":
    default:
      return createSnowPreset({ width, height });
  }
};
