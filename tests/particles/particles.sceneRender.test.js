import { describe, expect, it } from "vitest";
import {
  buildParticleFormValues,
  buildParticlePayload,
} from "../../src/pages/particles/support/particleForm.js";
import { buildLayoutRenderElements } from "../../src/internal/project/layout.js";
import { createParticlePreviewState } from "../../src/internal/particlePreview.js";
import {
  MAX_PARTICLE_COUNT,
  MAX_PARTICLE_RATE,
  normalizeParticleModules,
} from "../../src/internal/particles.js";

const projectResolution = { width: 640, height: 360 };
const imageItems = {
  "image-1": { id: "image-1", type: "image", name: "Flake", fileId: "file-1" },
};

const buildSceneParticleElement = (particle) => {
  const elements = buildLayoutRenderElements(
    [
      {
        id: "layer",
        type: "container",
        name: "Layer",
        x: 0,
        y: 0,
        width: 640,
        height: 360,
        children: [
          {
            id: "weather",
            type: "particle",
            name: "Weather",
            particleId: "particle-1",
            x: 0,
            y: 0,
            width: 640,
            height: 360,
          },
        ],
      },
    ],
    imageItems,
    { items: {} },
    { items: {} },
    { items: {} },
    {
      particlesData: {
        items: {
          "particle-1": { id: "particle-1", type: "particle", ...particle },
        },
      },
    },
  );
  return elements[0].children[0];
};

const savedParticle = (seed) => {
  const values = buildParticleFormValues({
    particle: undefined,
    presetId: "snow",
    projectResolution,
  });
  values.textureImageId = "image-1";
  values.seed = seed;
  return buildParticlePayload({ values, projectResolution });
};

describe("particle seed in scene render elements", () => {
  it("leaves the seed out when the Seed field was left blank", () => {
    // The form saves a blank seed as null; route-graphics rejects a non-number
    // seed with "seed must be a number", which fails every render of the scene.
    const particle = savedParticle("");
    expect(particle.seed).toBeNull();

    const element = buildSceneParticleElement(particle);
    expect(element.type).toBe("particles");
    expect("seed" in element).toBe(false);
  });

  it("keeps a numeric seed, including zero", () => {
    expect(buildSceneParticleElement(savedParticle("123")).seed).toBe(123);
    expect(buildSceneParticleElement(savedParticle("0")).seed).toBe(0);
  });

  it("drops a seed that is not a finite number", () => {
    for (const seed of [null, undefined, "", "12", Number.NaN, Infinity]) {
      const element = buildSceneParticleElement({
        ...savedParticle("1"),
        seed,
      });
      expect("seed" in element).toBe(false);
    }
  });

  it("applies the same rule to the particles page preview", () => {
    const particle = savedParticle("1");
    const withSeed = (seed) =>
      createParticlePreviewState({ ...particle, seed }).elements.find(
        (element) => element.type === "particles",
      );

    expect(withSeed(42).seed).toBe(42);
    for (const seed of [null, undefined, "", Number.NaN]) {
      expect("seed" in withSeed(seed)).toBe(false);
    }
  });
});

describe("particle emission counts", () => {
  const withCounts = (counts) => {
    const particle = savedParticle("1");
    return {
      ...particle,
      modules: {
        ...particle.modules,
        emission: { ...particle.modules.emission, ...counts },
      },
    };
  };

  it("limits Max Active and Burst count when the form saves", () => {
    const save = (values) => {
      const base = buildParticleFormValues({
        particle: undefined,
        presetId: "snow",
        projectResolution,
      });
      return buildParticlePayload({
        values: { ...base, textureImageId: "image-1", ...values },
        projectResolution,
      }).modules.emission;
    };

    expect(save({ maxActive: "1000000000" }).maxActive).toBe(
      MAX_PARTICLE_COUNT,
    );
    expect(save({ maxActive: "250" }).maxActive).toBe(250);
    expect(save({ emissionMode: "burst", burstCount: "1e9" }).burstCount).toBe(
      MAX_PARTICLE_COUNT,
    );
  });

  it("limits counts saved before the form had a limit, without editing the stored particle", () => {
    const stored = withCounts({ maxActive: 1000000000 });
    const element = buildSceneParticleElement(stored);

    expect(element.modules.emission.maxActive).toBe(MAX_PARTICLE_COUNT);
    expect(stored.modules.emission.maxActive).toBe(1000000000);

    const burst = buildSceneParticleElement(
      withCounts({ mode: "burst", burstCount: 5000000 }),
    );
    expect(burst.modules.emission.burstCount).toBe(MAX_PARTICLE_COUNT);
  });

  it("keeps counts at or below the limit as saved", () => {
    const element = buildSceneParticleElement(
      withCounts({ maxActive: MAX_PARTICLE_COUNT }),
    );
    expect(element.modules.emission.maxActive).toBe(MAX_PARTICLE_COUNT);
  });

  it("applies the same limit to the particles page preview", () => {
    const stored = withCounts({ maxActive: 1000000000 });
    const element = createParticlePreviewState(stored).elements.find(
      (item) => item.type === "particles",
    );
    expect(element.modules.emission.maxActive).toBe(MAX_PARTICLE_COUNT);
    expect(stored.modules.emission.maxActive).toBe(1000000000);
  });
});

describe("particle values route-graphics rejects", () => {
  const save = (values) => {
    const base = buildParticleFormValues({
      particle: undefined,
      presetId: "snow",
      projectResolution,
    });
    return buildParticlePayload({
      values: { ...base, textureImageId: "image-1", ...values },
      projectResolution,
    }).modules;
  };

  it("writes ranges with min not greater than max when the form saves", () => {
    // Setting Max below the preset's Min used to save a reversed range, which
    // route-graphics rejects and which then failed every render of the scene.
    const modules = save({
      lifetimeMin: "8",
      lifetimeMax: "2",
      speedMin: "300",
      speedMax: "100",
      scaleMin: "2",
      scaleMax: "0.5",
    });

    expect(modules.emission.particleLifetime).toEqual({ min: 2, max: 8 });
    expect(modules.movement.velocity.speed).toEqual({ min: 100, max: 300 });
    expect(modules.appearance.scale.min).toBe(0.5);
    expect(modules.appearance.scale.max).toBe(2);
  });

  it("writes a non-negative max speed and a limited emission rate", () => {
    const modules = save({
      maxSpeed: "-5",
      emissionRate: "99999999999999999999",
    });

    expect(modules.movement.maxSpeed).toBe(0);
    expect(modules.emission.rate).toBe(MAX_PARTICLE_RATE);
  });

  it("repairs values saved before the form did, without editing the stored particle", () => {
    const stored = savedParticle("1");
    stored.modules.emission.particleLifetime = { min: 9, max: 3 };
    stored.modules.movement.maxSpeed = -1;
    stored.modules.emission.rate = 1e20;

    const element = buildSceneParticleElement(stored);

    expect(element.modules.emission.particleLifetime).toEqual({
      min: 3,
      max: 9,
    });
    expect(element.modules.movement.maxSpeed).toBe(0);
    expect(element.modules.emission.rate).toBe(MAX_PARTICLE_RATE);
    expect(stored.modules.emission.particleLifetime).toEqual({
      min: 9,
      max: 3,
    });
    expect(stored.modules.movement.maxSpeed).toBe(-1);
  });

  it("keeps an inner radius within the circle's radius", () => {
    const modules = {
      emission: {
        source: {
          kind: "circle",
          data: { x: 0, y: 0, radius: 10, innerRadius: 50 },
        },
      },
    };
    expect(
      normalizeParticleModules(modules).emission.source.data.innerRadius,
    ).toBe(10);
  });

  it("leaves valid modules unchanged", () => {
    const modules = savedParticle("1").modules;
    const before = structuredClone(modules);
    expect(normalizeParticleModules(structuredClone(modules))).toEqual(before);
  });
});
