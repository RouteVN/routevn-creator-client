import { describe, expect, it } from "vitest";
import {
  buildParticleFormValues,
  buildParticlePayload,
  createParticleForm,
} from "../../src/pages/particles/support/particleForm.js";
import { createParticlePreset } from "../../src/pages/particles/support/particlePresets.js";

const createSnowFormValues = () =>
  buildParticleFormValues({
    particle: createParticlePreset({ presetId: "snow" }),
  });

describe("particle form", () => {
  it("allows Rotate Toward Movement to be off", () => {
    const form = createParticleForm({ activeTab: "movement" });
    const faceVelocityField = form.fields.find(
      (field) => field.name === "faceVelocity",
    );

    expect(faceVelocityField).toMatchObject({
      required: false,
      clearable: false,
    });
    expect(createSnowFormValues().faceVelocity).toBe(false);
  });

  it("removes inherited appearance rotation when facing velocity", () => {
    const baseParticle = createParticlePreset({ presetId: "snow" });
    const values = {
      ...createSnowFormValues(),
      faceVelocity: true,
    };

    const particle = buildParticlePayload({
      baseParticle,
      values,
    });

    expect(particle.modules.movement.faceVelocity).toBe(true);
    expect(particle.modules.appearance).not.toHaveProperty("rotation");
  });

  it("preserves appearance rotation when facing velocity is off", () => {
    const baseParticle = createParticlePreset({ presetId: "snow" });
    const particle = buildParticlePayload({
      baseParticle,
      values: createSnowFormValues(),
    });

    expect(particle.modules.movement.faceVelocity).toBe(false);
    expect(particle.modules.appearance.rotation).toEqual(
      baseParticle.modules.appearance.rotation,
    );
  });
});
