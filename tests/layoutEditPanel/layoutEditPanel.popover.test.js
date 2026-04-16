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
  it("uses the same special position popover for x and y", () => {
    const sharedValues = {
      x: 5000,
      y: 120,
    };
    const xPopover = openPositionPopover("x", sharedValues);
    const yPopover = openPositionPopover("y", sharedValues);

    expect(xPopover.context.isPositionPopover).toBe(true);
    expect(yPopover.context.isPositionPopover).toBe(true);
    expect(xPopover.form.fields).toEqual(yPopover.form.fields);
    expect(xPopover.form.fields[0]).toMatchObject({
      type: "slider-with-input",
      min: -1920,
      max: 5000,
      step: 1,
    });
    expect(yPopover.form.fields[0]).toMatchObject({
      type: "slider-with-input",
      min: -1920,
      max: 5000,
      step: 1,
    });
    expect(xPopover.context.positionPresetItems).toEqual(
      yPopover.context.positionPresetItems,
    );
    expect(
      xPopover.context.positionPresetItems.some(
        (item) => item.label === "1" && item.value === 1920,
      ),
    ).toBe(true);
  });
});
