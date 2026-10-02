import { describe, expect, it } from "vitest";
import {
  buildParticleFormValues,
  buildParticlePayload,
} from "../../src/pages/particles/support/particleForm.js";
import { buildLayoutRenderElements } from "../../src/internal/project/layout.js";
import { createParticlePreviewState } from "../../src/internal/particlePreview.js";
import { MAX_PARTICLE_COUNT } from "../../src/internal/particles.js";

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
