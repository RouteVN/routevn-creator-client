import { produce } from "immer";
import { describe, expect, it, vi } from "vitest";
import * as fieldStore from "../../src/components/sliderValueField/sliderValueField.store.js";
import {
  handleFormAction,
  handleFormChange,
  handleFormInput,
  handlePopoverClose,
  handlePresetsButtonClick,
  handleStepPress,
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
    refs: { form: { setValues: vi.fn() } },
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
  };
};

describe("rvn-slider-value-field", () => {
  it("shows its value with the unit, and an unset value as the default", () => {
    expect(createField().view().valueText).toBe("24 px");
    expect(createField({ value: undefined }).view().valueText).toBe("16 px");

    const html = renderViewYaml(TEMPLATE, createField().view());
    expect(html).toContain('aria-label="Font Size"');
    expect(html).toContain(">24 px<");
  });

  it("opens a slider under the field, from its value, with Presets and four step buttons", () => {
    const field = createField();
    field.open();

    const view = field.view();
    expect(view.popover).toMatchObject({ open: true, x: 200, y: 40 });
    expect(view.popoverDefaultValues).toEqual({ value: 24 });
    expect(view.popoverForm.fields[0]).toEqual({
      name: "value",
      type: "slider-with-input",
      min: 8,
      max: 128,
      step: 1,
    });
    expect(view.stepButtons.map(({ delta, label }) => [delta, label])).toEqual([
      [-4, "Decrease by 4"],
      [-1, "Decrease by 1"],
      [1, "Increase by 1"],
      [4, "Increase by 4"],
    ]);

    const html = renderViewYaml(TEMPLATE, view);
    expect(html).toContain(">Presets<");
    expect(html.match(/data-hold-repeat="true"/g)).toHaveLength(4);
  });

  it("reaches the slider to a value already outside its range", () => {
    expect(createField({ value: 240 }).view().popoverForm.fields[0].max).toBe(
      240,
    );
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
    handleFormAction(field.deps, {
      _event: { detail: { actionId: "submit", values: { value: 30 } } },
    });
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
});
