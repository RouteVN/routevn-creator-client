import { describe, expect, it } from "vitest";
import {
  createInitialState,
  openPopoverForm,
  setValues,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
import { selectLayoutEditPanelCopy } from "../../src/components/layoutEditPanel/support/layoutEditPanelCopy.js";
import { EN_I18N } from "../support/i18n.js";

const NUMBER_POPOVER_FORM = {
  fields: [
    {
      name: "value",
      type: "input-number",
    },
  ],
  actions: {
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: "Submit",
      },
    ],
  },
};

const openSliderPopover = (name, values = { x: 120, y: 120 }) => {
  const state = createInitialState();
  setValues({ state }, { values });

  openPopoverForm(
    { state },
    {
      x: 10,
      y: 20,
      name,
      form: structuredClone(NUMBER_POPOVER_FORM),
      projectResolution: {
        width: 1920,
        height: 1080,
      },
      copy: selectLayoutEditPanelCopy(EN_I18N),
    },
  );

  return state.popover;
};

describe("layoutEditPanel popover forms", () => {
  it("ranges x over the project's width and y over its height", () => {
    const sharedValues = {
      x: 5000,
      y: 120,
    };
    const xPopover = openSliderPopover("x", sharedValues);
    const yPopover = openSliderPopover("y", sharedValues);

    expect(xPopover.context.isSliderPopover).toBe(true);
    expect(yPopover.context.isSliderPopover).toBe(true);
    // Half the width or height beyond each edge, and further to reach the
    // field's own value when it is outside.
    expect(xPopover.form.fields[0]).toMatchObject({
      type: "slider-with-input",
      min: -960,
      max: 5000,
      step: 1,
    });
    expect(yPopover.form.fields[0]).toMatchObject({
      type: "slider-with-input",
      min: -540,
      max: 1620,
      step: 1,
    });
    // The presets slot holds the Presets button, so it has no heading.
    expect(xPopover.form.fields[1]).toEqual({
      type: "slot",
      slot: "slider-presets",
    });
    const presetValue = (popover, label) =>
      popover.context.presetItems.find((item) => item.label === label)?.value;
    expect(presetValue(xPopover, "1/2")).toBe(960);
    expect(presetValue(xPopover, "1")).toBe(1920);
    expect(presetValue(yPopover, "1/2")).toBe(540);
    expect(presetValue(yPopover, "1")).toBe(1080);
    expect(xPopover.context.presetItems[4]).toEqual({
      label: "1/2",
      value: 960,
      suffixText: "960 px",
    });
    expect(
      xPopover.context.stepButtons.map(({ delta, icon, label }) => [
        icon,
        delta,
        label,
      ]),
    ).toEqual([
      ["minusDouble", -10, "Decrease by 10"],
      ["minus", -1, "Decrease by 1"],
      ["plus", 1, "Increase by 1"],
      ["plusDouble", 10, "Increase by 10"],
    ]);
  });

  it("gives rotation a half turn each way, degree presets, and 1 and 15 degree steps", () => {
    const popover = openSliderPopover("rotation", { rotation: 270 });

    expect(popover.context.isSliderPopover).toBe(true);
    // It reaches a rotation already past half a turn.
    expect(popover.form.fields[0]).toMatchObject({
      type: "slider-with-input",
      min: -180,
      max: 270,
      step: 1,
    });
    expect(popover.context.presetItems.map((item) => item.label)).toEqual([
      "-180°",
      "-135°",
      "-90°",
      "-45°",
      "0°",
      "45°",
      "90°",
      "135°",
      "180°",
    ]);
    expect(popover.context.presetItems[6]).toEqual({ label: "90°", value: 90 });
    expect(popover.context.stepButtons.map((button) => button.delta)).toEqual([
      -15, -1, 1, 15,
    ]);
  });

  it("keeps opacity between 0 and 1, with percentage presets and 0.01 and 0.1 steps", () => {
    const popover = openSliderPopover("opacity", { opacity: 0.5 });

    expect(popover.form.fields[0]).toMatchObject({
      type: "slider-with-input",
      min: 0,
      max: 1,
      step: 0.01,
    });
    expect(popover.context.presetItems).toEqual([
      { label: "0%", value: 0, suffixText: "0" },
      { label: "25%", value: 0.25, suffixText: "0.25" },
      { label: "50%", value: 0.5, suffixText: "0.5" },
      { label: "75%", value: 0.75, suffixText: "0.75" },
      { label: "100%", value: 1, suffixText: "1" },
    ]);
    expect(popover.context.stepButtons.map((button) => button.delta)).toEqual([
      -0.1, -0.01, 0.01, 0.1,
    ]);
  });

  it("runs scale from 0 to 2, with percentage presets and 0.01 and 0.1 steps", () => {
    for (const name of ["scaleX", "scaleY"]) {
      const popover = openSliderPopover(name, { [name]: 1.5 });

      expect(popover.context.isSliderPopover).toBe(true);
      expect(popover.form.fields[0]).toMatchObject({
        type: "slider-with-input",
        min: 0,
        max: 2,
        step: 0.01,
      });
      expect(popover.context.presetItems.map((item) => item.label)).toEqual([
        "25%",
        "50%",
        "75%",
        "100%",
        "125%",
        "150%",
        "200%",
      ]);
      expect(popover.context.presetItems[3]).toEqual({
        label: "100%",
        value: 1,
        suffixText: "1",
      });
      expect(popover.context.stepButtons.map((button) => button.delta)).toEqual(
        [-0.1, -0.01, 0.01, 0.1],
      );
    }

    // A scale past 2 widens the slider to reach it.
    expect(
      openSliderPopover("scaleX", { scaleX: 3.4 }).form.fields[0].max,
    ).toBe(4);
    expect(openSliderPopover("scaleX", {}).defaultValues.value).toBe(1);
  });

  it("opens an unset rotation or opacity at its default, as the element draws it", () => {
    expect(openSliderPopover("opacity", {}).defaultValues.value).toBe(1);
    expect(openSliderPopover("rotation", {}).defaultValues.value).toBe(0);
    expect(
      openSliderPopover("opacity", { opacity: 0.4 }).defaultValues.value,
    ).toBe(0.4);
  });

  it("keeps other number popovers plain", () => {
    const popover = openSliderPopover("width", { width: 300 });

    expect(popover.context.isSliderPopover).toBeUndefined();
    expect(popover.form.fields[0].type).toBe("input-number");
  });
});
