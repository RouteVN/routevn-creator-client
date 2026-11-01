import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it, vi } from "vitest";
import {
  handleFormActions,
  handlePopoverFormChange,
} from "../../src/components/layoutEditPanel/layoutEditPanel.handlers.js";
import {
  createInitialState,
  selectFieldPopoverForm,
  setValues,
  updateValueProperty,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
import { validateForm } from "../../node_modules/@rettangoli/ui/src/components/form/form.store.js";
import {
  EN_I18N,
  ES_I18N,
  FR_I18N,
  JA_I18N,
  PT_I18N,
  RU_I18N,
  TH_I18N,
  VI_I18N,
  ZH_HANS_I18N,
} from "../support/i18n.js";

const LAYOUT_EDIT_PANEL_CONSTANTS = yaml.load(
  readFileSync(
    new URL(
      "../../src/components/layoutEditPanel/layoutEditPanel.constants.yaml",
      import.meta.url,
    ),
    "utf8",
  ),
);

const selectFieldForm = (i18n = EN_I18N) =>
  selectFieldPopoverForm(
    {
      constants: LAYOUT_EDIT_PANEL_CONSTANTS,
      props: { resourceType: "layouts" },
      i18n,
    },
    { name: "field" },
  );

const createSubmitDeps = ({ field = "email" } = {}) => {
  const state = createInitialState();
  setValues({ state }, { values: { type: "input", field } });
  const dispatchEvent = vi.fn();
  const closePopoverForm = vi.fn();
  const render = vi.fn();

  return {
    state,
    dispatchEvent,
    closePopoverForm,
    render,
    deps: {
      store: {
        selectPopoverForm: () => ({
          name: "field",
          defaultValues: { value: field },
        }),
        selectValues: () => state.values,
        updateValueProperty: (payload) =>
          updateValueProperty({ state }, payload),
        closePopoverForm,
      },
      props: {},
      dispatchEvent,
      render,
    },
  };
};

const submit = (deps, detail) =>
  handleFormActions(deps, { _event: { detail } });

describe("layoutEditPanel Input field name", () => {
  it("rejects an empty or blank name with the localized message", () => {
    const form = selectFieldForm();
    const message = EN_I18N.layoutEditPanel.inputFieldRequired;

    expect(message).toBe("Field name is required.");
    for (const value of ["", "   "]) {
      expect(validateForm(form.fields, { value })).toEqual({
        valid: false,
        errors: { value: message },
      });
    }
    expect(validateForm(form.fields, { value: "email" }).valid).toBe(true);
  });

  it("validates the form when Submit is pressed", () => {
    const { buttons } = selectFieldForm().actions;

    expect(buttons).toEqual([
      expect.objectContaining({ id: "submit", validate: true }),
    ]);
  });

  it("shows the message in the active language", () => {
    const form = selectFieldForm(FR_I18N);
    const [field] = form.fields;

    expect(field.required.message).toBe(
      FR_I18N.layoutEditPanel.inputFieldRequired,
    );
    expect(field.rules[0].message).toBe(
      FR_I18N.layoutEditPanel.inputFieldRequired,
    );
    expect(validateForm(form.fields, { value: "" }).errors.value).toBe(
      "Le nom du champ est obligatoire.",
    );
  });

  it("translates the message in every language", () => {
    for (const i18n of [
      ES_I18N,
      FR_I18N,
      JA_I18N,
      PT_I18N,
      RU_I18N,
      TH_I18N,
      VI_I18N,
      ZH_HANS_I18N,
    ]) {
      expect(i18n.layoutEditPanel.inputFieldRequired).not.toBe(
        EN_I18N.layoutEditPanel.inputFieldRequired,
      );
    }
  });

  it("keeps the other popover forms free of required rules", () => {
    const form = selectFieldPopoverForm(
      {
        constants: LAYOUT_EDIT_PANEL_CONSTANTS,
        props: { resourceType: "layouts" },
        i18n: EN_I18N,
      },
      { name: "x" },
    );

    expect(form.fields[0].required).toBeUndefined();
    expect(form.actions.buttons[0].validate).toBeUndefined();
  });

  it("does not apply or close the popover while the form is invalid", () => {
    const { deps, state, dispatchEvent, closePopoverForm } = createSubmitDeps();

    submit(deps, {
      actionId: "submit",
      values: { value: "" },
      valid: false,
      errors: { value: EN_I18N.layoutEditPanel.inputFieldRequired },
    });

    expect(state.values.field).toBe("email");
    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(closePopoverForm).not.toHaveBeenCalled();
  });

  it("keeps the form when the name is committed, so its message stays", async () => {
    const updatePopoverFormContext = vi.fn();
    const setPopoverFormValue = vi.fn();
    const render = vi.fn();
    const deps = {
      store: {
        selectPopoverForm: () => ({ name: "field", defaultValues: {} }),
        updatePopoverFormContext,
        setPopoverFormValue,
      },
      props: {},
      i18n: EN_I18N,
      dispatchEvent: vi.fn(),
      render,
    };

    // Blurring the input commits the value just before the Submit click, and
    // rebuilding the form then would drop the message the click shows.
    await handlePopoverFormChange(deps, {
      _event: { detail: { values: { value: "" } } },
    });

    expect(updatePopoverFormContext).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    expect(setPopoverFormValue).toHaveBeenCalledWith({ value: "" });
  });

  it("applies a valid name and closes the popover", () => {
    const { deps, state, dispatchEvent, closePopoverForm } = createSubmitDeps();

    submit(deps, {
      actionId: "submit",
      values: { value: "username" },
      valid: true,
      errors: {},
    });

    expect(state.values.field).toBe("username");
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ name: "field", value: "username" }),
      }),
    );
    expect(closePopoverForm).toHaveBeenCalledTimes(1);
  });
});
