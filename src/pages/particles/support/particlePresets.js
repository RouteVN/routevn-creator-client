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
    id: "fire",
    label: "Fire",
    description: "Compact flame plume rising from the bottom.",
  },
  {
    id: "smoke",
    label: "Smoke",
    description: "Slow drifting smoke with soft fade-out.",
  },
  {
    id: "embers",
    label: "Embers",
    description: "Small glowing sparks that float upward.",
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
        rate: 56,
        maxActive: 160,
        duration: "infinite",
        particleLifetime: createRange(4, 7),
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
          speed: createRange(32, 80),
        },
        acceleration: {
          x: 4,
          y: 10,
        },
        maxSpeed: 110,
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
          [0.12, 0.92],
          [0.82, 0.78],
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
        maxActive: 120,
        duration: "infinite",
        particleLifetime: createRange(0.55, 0.95),
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

const createFirePreset = ({ width, height }) => {
  const sourceWidth = Math.max(64, Math.round(width * 0.18));

  return createParticle({
    name: "Fire",
    description: "A compact flame plume.",
    width,
    height,
    seed: 20260406,
    modules: {
      emission: {
        mode: "continuous",
        rate: 92,
        maxActive: 120,
        duration: "infinite",
        particleLifetime: createRange(0.45, 0.95),
        source: {
          kind: "rect",
          data: {
            x: Math.round((width - sourceWidth) / 2),
            y: Math.round(height - 140),
            width: sourceWidth,
            height: 14,
          },
        },
      },
      movement: {
        velocity: {
          kind: "directional",
          direction: createRange(-98, -82),
          speed: createRange(65, 150),
        },
        acceleration: {
          x: 0,
          y: -220,
        },
        maxSpeed: 260,
        faceVelocity: false,
      },
      appearance: {
        scale: createCurve([
          [0, 0.45],
          [0.2, 1.12],
          [0.72, 0.78],
          [1, 0.18],
        ]),
        alpha: createCurve([
          [0, 0],
          [0.1, 0.95],
          [0.72, 0.58],
          [1, 0],
        ]),
        rotation: createSpinRotation(-28, 28),
      },
      bounds: {
        mode: "recycle",
        source: "area",
        padding: 140,
      },
    },
  });
};

const createSmokePreset = ({ width, height }) => {
  const sourceWidth = Math.max(56, Math.round(width * 0.12));

  return createParticle({
    name: "Smoke",
    description: "A slow soft smoke plume.",
    width,
    height,
    seed: 20260407,
    modules: {
      emission: {
        mode: "continuous",
        rate: 28,
        maxActive: 56,
        duration: "infinite",
        particleLifetime: createRange(1.8, 3.1),
        source: {
          kind: "rect",
          data: {
            x: Math.round((width - sourceWidth) / 2),
            y: Math.round(height - 150),
            width: sourceWidth,
            height: 18,
          },
        },
      },
      movement: {
        velocity: {
          kind: "directional",
          direction: createRange(-100, -82),
          speed: createRange(10, 32),
        },
        acceleration: {
          x: 6,
          y: -16,
        },
        maxSpeed: 78,
        faceVelocity: false,
      },
      appearance: {
        scale: createCurve([
          [0, 0.24],
          [0.3, 0.92],
          [1, 2.1],
        ]),
        alpha: createCurve([
          [0, 0],
          [0.18, 0.34],
          [0.72, 0.2],
          [1, 0],
        ]),
        rotation: createSpinRotation(-14, 14),
      },
      bounds: {
        mode: "recycle",
        source: "area",
        padding: 120,
      },
    },
  });
};

const createEmbersPreset = ({ width, height }) => {
  const sourceWidth = Math.max(48, Math.round(width * 0.12));

  return createParticle({
    name: "Embers",
    description: "Small glowing embers floating upward.",
    width,
    height,
    seed: 20260411,
    modules: {
      emission: {
        mode: "continuous",
        rate: 16,
        maxActive: 28,
        duration: "infinite",
        particleLifetime: createRange(0.8, 1.8),
        source: {
          kind: "rect",
          data: {
            x: Math.round((width - sourceWidth) / 2),
            y: Math.round(height - 135),
            width: sourceWidth,
            height: 12,
          },
        },
      },
      movement: {
        velocity: {
          kind: "directional",
          direction: createRange(-112, -68),
          speed: createRange(32, 86),
        },
        acceleration: {
          x: 0,
          y: -80,
        },
        maxSpeed: 140,
        faceVelocity: false,
      },
      appearance: {
        scale: createCurve([
          [0, 0.18],
          [0.22, 0.52],
          [1, 0.08],
        ]),
        alpha: createCurve([
          [0, 0],
          [0.1, 1],
          [0.68, 0.46],
          [1, 0],
        ]),
        rotation: createSpinRotation(-40, 40),
      },
      bounds: {
        mode: "recycle",
        source: "area",
        padding: 100,
      },
    },
  });
};

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
            x: Math.round(width * 0.12),
            y: Math.round(height * 0.12),
            width: Math.round(width * 0.76),
            height: Math.round(height * 0.66),
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
    case "fire":
      return createFirePreset({ width, height });
    case "smoke":
      return createSmokePreset({ width, height });
    case "embers":
      return createEmbersPreset({ width, height });
    case "sparkle":
      return createSparklePreset({ width, height });
    case "snow":
    default:
      return createSnowPreset({ width, height });
  }
};
