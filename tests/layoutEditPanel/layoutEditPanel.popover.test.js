import { describe, expect, it } from "vitest";
import {
  createInitialState,
  openPopoverForm,
  setValues,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";

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

const openPositionPopover = (name, values = { x: 120, y: 120 }) => {
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
    const xPopover = openPositionPopover("x", sharedValues);
    const yPopover = openPositionPopover("y", sharedValues);

    expect(xPopover.context.isPositionPopover).toBe(true);
    expect(yPopover.context.isPositionPopover).toBe(true);
    // The slider also reaches the field's own value when it is outside.
    // Half the width or height beyond each edge.
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
      slot: "position-presets",
    });
    const presetValue = (popover, label) =>
      popover.context.positionPresetItems.find((item) => item.label === label)
        ?.value;
    expect(presetValue(xPopover, "1/2")).toBe(960);
    expect(presetValue(xPopover, "1")).toBe(1920);
    expect(presetValue(yPopover, "1/2")).toBe(540);
    expect(presetValue(yPopover, "1")).toBe(1080);
  });
});
