import { describe, expect, it } from "vitest";
import {
  buildParticleFormValues,
  buildParticlePayload,
  createParticleForm,
} from "../../src/pages/particles/support/particleForm.js";
import { createParticlePreset } from "../../src/pages/particles/support/particlePresets.js";
import {
  createInitialState,
  selectViewData,
  setDialogFormValues,
} from "../../src/pages/particles/particles.store.js";
import { EN_I18N } from "../support/i18n.js";

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

  describe("opacity", () => {
    const createFixedOpacityParticle = (value) => {
      const particle = createParticlePreset({ presetId: "rain" });
      particle.modules.appearance.alpha = { mode: "single", value };
      return particle;
    };

    const savedOpacity = (baseParticle, changes) =>
      buildParticlePayload({
        baseParticle,
        values: {
          ...buildParticleFormValues({ particle: baseParticle }),
          ...changes,
        },
      }).modules.appearance.alpha;

    it("shows Fixed or Curve, with fade fields only for Curve", () => {
      const form = createParticleForm({ activeTab: "appearance" });
      const field = (name) => form.fields.find((item) => item.name === name);

      expect(field("opacityMode")).toMatchObject({
        type: "segmented-control",
        label: "Opacity",
        options: [
          { label: "Fixed", value: "fixed" },
          { label: "Curve", value: "curve" },
        ],
      });
      expect(field("opacity")).toMatchObject({ min: 0, max: 1 });
      expect(field("opacity")).not.toHaveProperty("$when");
      expect(field("opacityFadeIn").$when).toBe("opacityMode == 'curve'");
      expect(field("opacityFadeOut").$when).toBe("opacityMode == 'curve'");
    });

    it.each([
      [
        "a fixed value",
        createFixedOpacityParticle(0.72),
        { opacityMode: "fixed", opacity: "0.72" },
      ],
      [
        "the Snow curve",
        createParticlePreset({ presetId: "snow" }),
        {
          opacityMode: "curve",
          opacity: "0.92",
          opacityFadeIn: "8",
          opacityFadeOut: "10",
        },
      ],
      [
        "the Sparkle curve",
        createParticlePreset({ presetId: "sparkle" }),
        {
          opacityMode: "curve",
          opacity: "1",
          opacityFadeIn: "20",
          opacityFadeOut: "22",
        },
      ],
    ])("reads %s into the form", (_, particle, expected) => {
      expect(buildParticleFormValues({ particle })).toMatchObject(expected);
    });

    it("keeps a preset curve exactly when opacity is not edited", () => {
      const snow = createParticlePreset({ presetId: "snow" });

      expect(savedOpacity(snow, {})).toEqual(snow.modules.appearance.alpha);
    });

    it("saves an edited fixed value", () => {
      expect(
        savedOpacity(createFixedOpacityParticle(0.72), { opacity: "0.5" }),
      ).toEqual({ mode: "single", value: 0.5 });
    });

    it("keeps the fade timing when the curve's peak changes", () => {
      expect(
        savedOpacity(createParticlePreset({ presetId: "snow" }), {
          opacity: "0.5",
        }),
      ).toEqual({
        mode: "curve",
        keys: [
          { time: 0, value: 0 },
          { time: 0.08, value: 0.5 },
          { time: 0.9, value: 0.5 },
          { time: 1, value: 0 },
        ],
      });
    });

    it("starts a curve from the fixed value when switching to Curve", () => {
      expect(
        savedOpacity(createFixedOpacityParticle(0.72), {
          opacityMode: "curve",
        }),
      ).toEqual({
        mode: "curve",
        keys: [
          { time: 0, value: 0 },
          { time: 0.1, value: 0.72 },
          { time: 0.9, value: 0.72 },
          { time: 1, value: 0 },
        ],
      });
    });

    it("uses the peak when switching a curve to Fixed", () => {
      expect(
        savedOpacity(createParticlePreset({ presetId: "snow" }), {
          opacityMode: "fixed",
        }),
      ).toEqual({ mode: "single", value: 0.92 });
    });

    it("drops fades set to 0", () => {
      expect(
        savedOpacity(createFixedOpacityParticle(0.6), {
          opacityMode: "curve",
          opacityFadeIn: "0",
          opacityFadeOut: "0",
        }),
      ).toEqual({
        mode: "curve",
        keys: [
          { time: 0, value: 0.6 },
          { time: 1, value: 0.6 },
        ],
      });
    });

    it("keeps overlapping fades sorted with a single peak", () => {
      const { keys } = savedOpacity(createFixedOpacityParticle(1), {
        opacityMode: "curve",
        opacityFadeIn: "70",
        opacityFadeOut: "60",
      });
      const times = keys.map((key) => key.time);

      expect(times).toEqual([...times].sort((a, b) => a - b));
      expect(keys[0]).toEqual({ time: 0, value: 0 });
      expect(keys.at(-1)).toEqual({ time: 1, value: 0 });
      expect(Math.max(...keys.map((key) => key.value))).toBe(1);
    });

    it("limits opacity to 1", () => {
      expect(
        savedOpacity(createFixedOpacityParticle(0.72), { opacity: "2" }),
      ).toEqual({ mode: "single", value: 1 });
    });

    it("remounts the form when Opacity switches mode, so revealed fades show their values", () => {
      const state = createInitialState();
      const formKeyFor = (opacityMode) => {
        setDialogFormValues(
          { state },
          { values: { ...state.dialogFormValues, opacityMode } },
        );
        return selectViewData({ state, i18n: EN_I18N }).particleFormKey;
      };

      expect(formKeyFor("fixed")).not.toBe(formKeyFor("curve"));
    });

    it("treats a cleared opacity as fully visible", () => {
      expect(
        savedOpacity(createFixedOpacityParticle(0.72), { opacity: "" }),
      ).toEqual({ mode: "single", value: 1 });
    });
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
