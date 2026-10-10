import { describe, expect, it } from "vitest";
import {
  applyParticleFormChange,
  buildParticleEffectData,
  buildParticleFormValues,
  createParticleForm,
} from "../../src/pages/particleEditor/support/particleEditorForm.js";
import { createParticlePreset } from "../../src/pages/particles/support/particlePresets.js";
import {
  createInitialState,
  loadParticle,
  selectViewData,
  setEffect,
} from "../../src/pages/particleEditor/particleEditor.store.js";
import { EN_I18N } from "../support/i18n.js";

const createSnowFormValues = () =>
  buildParticleFormValues({
    particle: createParticlePreset({ presetId: "snow" }),
  });

const sectionFields = (id) =>
  createParticleForm().fields.find((section) => section.id === id).fields;

describe("particle form", () => {
  it("edits the effect only: Basics has the size and seed", () => {
    const fieldNames = (id) =>
      sectionFields(id).map((field) => field.name ?? field.slot);

    expect(fieldNames("basics")).toEqual(["width", "height", "seed"]);
    expect(fieldNames("appearance")[0]).toBe("particle-texture-image");
    expect(createParticleForm().actions.buttons).toEqual([]);
  });

  it("keeps the mode and shape choices from being cleared", () => {
    const fields = ["emission", "source", "movement"].flatMap(sectionFields);
    const field = (name) => fields.find((item) => item.name === name);

    // Clearing one would silently swap the effect for a default and save it.
    for (const name of [
      "emissionMode",
      "durationMode",
      "sourceKind",
      "velocityKind",
    ]) {
      expect(field(name)).toMatchObject({ clearable: false });
    }
  });

  it("keeps a timed duration when Timed is chosen before its seconds", () => {
    const snow = createParticlePreset({ presetId: "snow" });
    const values = buildParticleFormValues({ particle: snow });
    expect(values.durationSeconds).toBe("");

    const particle = buildParticleEffectData({
      baseParticle: snow,
      values: { ...values, durationMode: "timed" },
    });

    // The empty seconds field is not 0 seconds, which would show nothing.
    expect(particle.modules.emission.duration).toBe(1);
  });

  it("saves the effect without the particle's name, description or tags", () => {
    const snow = createParticlePreset({ presetId: "snow" });

    expect(
      Object.keys(
        buildParticleEffectData({
          baseParticle: snow,
          values: buildParticleFormValues({ particle: snow }),
        }),
      ).sort(),
    ).toEqual(["height", "modules", "seed", "width"]);
  });

  it("asks the form to show a value as the particle keeps it", () => {
    const snow = createParticlePreset({ presetId: "snow" });

    expect(
      applyParticleFormChange(snow, { name: "emissionRate", value: 30 }),
    ).toMatchObject({ refreshForm: false });
    // Widths are whole pixels.
    expect(
      applyParticleFormChange(snow, { name: "width", value: 800.6 }),
    ).toMatchObject({ effect: { width: 801 }, refreshForm: true });
    // A Max below Min swaps them.
    expect(
      applyParticleFormChange(snow, { name: "lifetimeMax", value: 2 }),
    ).toMatchObject({
      effect: {
        modules: { emission: { particleLifetime: { min: 2, max: 8.5 } } },
      },
      refreshForm: true,
    });
  });

  it("allows Rotate Toward Movement to be off", () => {
    const faceVelocityField = sectionFields("movement").find(
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

    const particle = buildParticleEffectData({
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
      buildParticleEffectData({
        baseParticle,
        values: {
          ...buildParticleFormValues({ particle: baseParticle }),
          ...changes,
        },
      }).modules.appearance.alpha;

    it("shows Fixed or Curve, with fade fields only for Curve", () => {
      const field = (name) =>
        sectionFields("appearance").find((item) => item.name === name);

      expect(field("opacityMode")).toMatchObject({
        type: "segmented-control",
        label: "Opacity",
        options: [
          { label: "Fixed", value: "fixed" },
          { label: "Curve", value: "curve" },
        ],
      });
      // Clicking the selected mode again must not clear it.
      expect(field("opacityMode").clearable).toBe(false);
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

    it("scales the whole curve when only the peak changes, keeping Snow's dip", () => {
      expect(
        savedOpacity(createParticlePreset({ presetId: "snow" }), {
          opacity: "0.5",
        }),
      ).toEqual({
        mode: "curve",
        keys: [
          { time: 0, value: 0 },
          { time: 0.08, value: 0.5 },
          // 0.78 * 0.5 / 0.92, rounded to 4 decimals.
          { time: 0.9, value: 0.4239 },
          { time: 1, value: 0 },
        ],
      });
    });

    it("rebuilds the fade shape when a fade changes", () => {
      expect(
        savedOpacity(createParticlePreset({ presetId: "snow" }), {
          opacityFadeIn: "5",
        }),
      ).toEqual({
        mode: "curve",
        keys: [
          { time: 0, value: 0 },
          { time: 0.05, value: 0.92 },
          { time: 0.9, value: 0.92 },
          { time: 1, value: 0 },
        ],
      });
    });

    it("ignores the hidden fade fields while Fixed is selected", () => {
      const particle = createParticlePreset({ presetId: "rain" });
      delete particle.modules.appearance.alpha;

      expect(
        savedOpacity(particle, { opacityMode: "fixed", opacityFadeIn: "25" }),
      ).toBeUndefined();
    });

    it.each([
      ["Fade Out 7%", { opacityFadeOut: "7" }, [0, 0.1, 0.93, 1]],
      [
        "fades that meet at 30%",
        { opacityFadeIn: "30", opacityFadeOut: "70" },
        [0, 0.3, 1],
      ],
    ])("saves times without float noise for %s", (_, changes, times) => {
      const { keys } = savedOpacity(createFixedOpacityParticle(0.8), {
        opacityMode: "curve",
        ...changes,
      });

      expect(keys.map((key) => key.time)).toEqual(times);
    });

    it.each([
      ["a curve without keys", { mode: "curve" }],
      ["a curve with empty keys", { mode: "curve", keys: [] }],
      ["a curve with keys that aren't a list", { mode: "curve", keys: "bad" }],
      [
        "a curve with unusable keys",
        { mode: "curve", keys: [{ time: "x", value: null }, undefined] },
      ],
      ["a non-numeric fixed value", { mode: "single", value: "abc" }],
      ["a value that isn't an object", "bad"],
      ["null", null],
    ])("opens and saves %s without crashing", (_, alpha) => {
      const particle = createParticlePreset({ presetId: "rain" });
      particle.modules.appearance.alpha = alpha;

      expect(buildParticleFormValues({ particle })).toMatchObject({
        opacityMode: "fixed",
        opacity: "1",
      });
      expect(savedOpacity(particle, {})).toEqual(alpha);
      expect(savedOpacity(particle, { opacity: "0.5" })).toEqual({
        mode: "single",
        value: 0.5,
      });
    });

    it("reads an unsorted, out-of-range curve and saves it sorted and in range", () => {
      const particle = createParticlePreset({ presetId: "rain" });
      particle.modules.appearance.alpha = {
        mode: "curve",
        keys: [
          { time: 1, value: 0 },
          { time: 0.5, value: 2 },
          { time: -1, value: 0 },
        ],
      };

      expect(buildParticleFormValues({ particle })).toMatchObject({
        opacityMode: "curve",
        opacity: "1",
        opacityFadeIn: "50",
        opacityFadeOut: "50",
      });
      expect(savedOpacity(particle, { opacity: "0.5" })).toEqual({
        mode: "curve",
        keys: [
          { time: 0, value: 0 },
          { time: 0.5, value: 0.5 },
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
      const particle = createFixedOpacityParticle(0.72);
      loadParticle({ state }, { item: { id: "particle-1", ...particle } });
      const formKeyFor = (opacityMode) => {
        const { effect } = applyParticleFormChange(particle, {
          name: "opacityMode",
          value: opacityMode,
        });
        setEffect({ state }, { effect });
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
    const particle = buildParticleEffectData({
      baseParticle,
      values: createSnowFormValues(),
    });

    expect(particle.modules.movement.faceVelocity).toBe(false);
    expect(particle.modules.appearance.rotation).toEqual(
      baseParticle.modules.appearance.rotation,
    );
  });
});
