import { produce } from "immer";
import { describe, expect, it, vi } from "vitest";
import * as fieldStore from "../../src/components/sliderValueField/sliderValueField.store.js";
import {
  handleFormChange,
  handleFormInput,
  handleFormKeyDown,
  handlePopoverClose,
  handlePresetsButtonClick,
  handleStepPress,
  handleSubmitClick,
  handleValueClick,
} from "../../src/components/sliderValueField/sliderValueField.handlers.js";
import { EN_I18N } from "../support/i18n.js";
import { renderViewYaml } from "../support/renderView.js";

const TEMPLATE = "src/components/sliderValueField/sliderValueField.view.yaml";

const FIELD = {
  defaultValue: 16,
  step: 1,
  fastStep: 4,
  min: 8,
  max: 400,
  range: { min: 8, max: 128 },
  unit: "px",
  presets: [
    { label: "12 px", value: 12 },
    { label: "24 px", value: 24 },
  ],
};

const createField = ({ menuResult, ...propOverrides } = {}) => {
  let state = fieldStore.createInitialState();
  const props = {
    value: 24,
    label: "Font Size",
    field: FIELD,
    ...propOverrides,
  };
  const store = new Proxy(
    {},
    {
      get: (_target, name) => (payload) => {
        if (name.startsWith("select")) {
          return fieldStore[name]({ state, props }, payload);
        }
        state = produce(state, (draft) => {
          fieldStore[name]({ state: draft }, payload);
        });
      },
    },
  );
  const events = [];
  const deps = {
    store,
    props,
    render: vi.fn(),
    dispatchEvent: (event) => events.push([event.type, event.detail]),
    // The form holds the popover's value, as its own form does.
    refs: {
      form: {
        setValues: vi.fn(),
        getValues: () => ({ value: state.popover.value }),
      },
    },
    appService: { showDropdownMenu: vi.fn(async () => menuResult) },
  };
  const rect = { left: 100, width: 200, bottom: 40 };
  const target = { getBoundingClientRect: () => rect };
  return {
    deps,
    events,
    view: () => fieldStore.selectViewData({ state, props, i18n: EN_I18N }),
    open: () => handleValueClick(deps, { _event: { currentTarget: target } }),
    step: (delta) =>
      handleStepPress(deps, {
        _event: { currentTarget: { dataset: { delta: String(delta) } } },
      }),
    pickPreset: () =>
      handlePresetsButtonClick(deps, { _event: { currentTarget: target } }),
    input: (value) =>
      handleFormInput(deps, { _event: { detail: { values: { value } } } }),
    pressKey: ({ path = [{ tagName: "INPUT" }], ...event } = {}) => {
      const _event = {
        key: "Enter",
        composedPath: () => path,
        preventDefault: vi.fn(),
        ...event,
      };
      handleFormKeyDown(deps, { _event });
      return _event;
    },
  };
};

describe("rvn-slider-value-field", () => {
  it("shows its value with the unit, and an unset value as the default", () => {
    expect(createField().view().valueText).toBe("24 px");
    expect(createField({ value: undefined }).view().valueText).toBe("16 px");

    const html = renderViewYaml(TEMPLATE, createField().view());
    expect(html).toContain('aria-label="Font Size"');
    // It looks like rtgl-select's button.
    const valueButton = html.match(/<rtgl-view id="valueButton"[^>]*>/)[0];
    for (const attribute of ['bgc="su"', 'bw="xs"', 'bc="bo"', 'h="32"']) {
      expect(valueButton).toContain(attribute);
    }
    expect(html).toContain(">24 px<");
  });

  it("opens a slider under the field, from its value, with Presets, four step buttons, and Submit in one row", () => {
    const field = createField();
    field.open();

    const view = field.view();
    expect(view.popover).toMatchObject({ open: true, x: 200, y: 40 });
    expect(view.popoverDefaultValues).toEqual({ value: 24 });
    // The slider runs over the field's range; a typed value reaches its
    // bounds. The number input is small, as the buttons below it are.
    expect(view.popoverForm.fields[0]).toEqual({
      name: "value",
      type: "slider-with-input",
      s: "sm",
      min: 8,
      max: 400,
      sliderMin: 8,
      sliderMax: 128,
      step: 1,
    });
    expect(
      view.stepButtons.map(({ delta, text, label }) => [delta, text, label]),
    ).toEqual([
      [-4, "−4", "Decrease by 4"],
      [-1, "−1", "Decrease by 1"],
      [1, "+1", "Increase by 1"],
      [4, "+4", "Increase by 4"],
    ]);
    // Submit sits in the presets row, so the form has no actions row.
    expect(view.popoverForm.actions).toBeUndefined();

    const html = renderViewYaml(TEMPLATE, view);
    const row = html.slice(html.indexOf('slot="slider-presets"'));
    // Presets is a square chevron button, named by its label.
    const presetsButton = row.match(/<rtgl-button id="presetsButton"[^>]*>/)[0];
    for (const attribute of [
      'pre="chevronDown"',
      " sq",
      'aria-label="Presets"',
    ]) {
      expect(presetsButton).toContain(attribute);
    }
    const rowOrder = [
      'id="presetsButton"',
      ">−4<",
      ">−1<",
      ">+1<",
      ">+4<",
      ">Submit<",
    ].map((text) => row.indexOf(text));
    expect(rowOrder.every((index) => index > -1)).toBe(true);
    expect(rowOrder).toEqual([...rowOrder].sort((a, b) => a - b));
    expect(html.match(/data-hold-repeat="true"/g)).toHaveLength(4);
  });

  it("shows the steps as percentages where the field asks", () => {
    const field = createField({
      value: 0.5,
      field: {
        defaultValue: 0.5,
        step: 0.05,
        fastStep: 0.25,
        stepsAsPercent: true,
        min: 0,
        max: 1,
        presets: [],
      },
    });

    expect(
      field.view().stepButtons.map(({ text, label }) => [text, label]),
    ).toEqual([
      ["−25%", "Decrease by 25%"],
      ["−5%", "Decrease by 5%"],
      ["+5%", "Increase by 5%"],
      ["+25%", "Increase by 25%"],
    ]);
  });

  it("keeps the slider's range for a value past it, and steps it within the field's bounds", () => {
    const field = createField({ value: 398 });
    field.open();

    expect(field.view().popoverForm.fields[0]).toMatchObject({
      max: 400,
      sliderMax: 128,
    });
    field.step(4);
    expect(field.events.at(-1)).toEqual(["value-input", { value: 400 }]);
  });

  it("shows each change as it happens, without changing its value", () => {
    const field = createField();
    field.open();

    field.input(30);
    field.step(4);
    expect(field.events).toEqual([
      ["value-input", { value: 30 }],
      ["value-input", { value: 34 }],
    ]);
    // A step goes into the form in place, so a held button stays.
    expect(field.deps.refs.form.setValues).toHaveBeenCalledWith({
      values: { value: 34 },
    });
    expect(field.view().popover.key).toBe(1);
    expect(field.view().valueText).toBe("24 px");
  });

  it("keeps a step within the field's bounds", () => {
    const field = createField({ value: 10 });
    field.open();

    field.step(-4);
    expect(field.events.at(-1)).toEqual(["value-input", { value: 8 }]);
  });

  it("picks a preset from the Presets menu", async () => {
    const field = createField({ menuResult: { item: { key: "12" } } });
    field.open();

    await field.pickPreset();
    expect(field.deps.appService.showDropdownMenu).toHaveBeenCalledWith({
      items: [
        { type: "item", label: "12 px", key: "12" },
        { type: "item", label: "24 px", key: "24" },
      ],
      x: 100,
      y: 40,
      place: "bs",
    });
    expect(field.events).toEqual([["value-input", { value: 12 }]]);
    expect(field.deps.refs.form.setValues).toHaveBeenCalledWith({
      values: { value: 12 },
    });
  });

  it("changes on Submit, and reports closing without it as a cancel", () => {
    const field = createField();
    field.open();
    handleFormChange(field.deps, {
      _event: { detail: { values: { value: 30 } } },
    });
    handleSubmitClick(field.deps);
    // The popover reports closing after Submit too.
    handlePopoverClose(field.deps);
    expect(field.events).toEqual([
      ["value-input", { value: 30 }],
      ["value-change", { value: 30 }],
    ]);
    expect(field.view().popover.open).toBe(false);

    field.open();
    handlePopoverClose(field.deps);
    expect(field.events.at(-1)).toEqual(["value-cancel", null]);
  });

  it("changes on Enter, unless a button or the form takes the key", () => {
    const field = createField();
    field.open();
    field.input(30);

    field.pressKey({
      path: [{ tagName: "BUTTON" }, { tagName: "RTGL-BUTTON" }],
    });
    field.pressKey({ defaultPrevented: true });
    field.pressKey({ isComposing: true });
    field.pressKey({ key: "Tab" });
    expect(field.view().popover.open).toBe(true);

    const enter = field.pressKey();
    expect(enter.preventDefault).toHaveBeenCalledOnce();
    expect(field.events.at(-1)).toEqual(["value-change", { value: 30 }]);
    expect(field.view().popover.open).toBe(false);
  });
  it("shows an unset value as its emptyText, opens at the default, and unsets it from an empty preset", async () => {
    const field = createField({
      value: "",
      menuResult: { item: { key: "" } },
      field: {
        ...FIELD,
        defaultValue: 1,
        emptyText: "Random",
        presets: [
          { label: "Random", value: "" },
          { label: "10", value: 10 },
        ],
      },
    });

    expect(field.view().valueText).toBe("Random");
    field.open();
    expect(field.view().popover.value).toBe(1);

    await field.pickPreset();
    expect(field.events).toEqual([["value-change", { value: "" }]]);
    expect(field.view().popover.open).toBe(false);
  });

  it("shows an unset value as its default without an emptyText", () => {
    expect(createField({ value: "" }).view().valueText).toBe("16 px");
  });
});
