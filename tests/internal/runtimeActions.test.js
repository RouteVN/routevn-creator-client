import { describe, expect, it } from "vitest";
import {
  createRuntimeActionDefaultValues,
  createRuntimeActionForm,
  createRuntimeActionPreview,
  createRuntimeActionSubmitDetail,
  getRuntimeActionDefinition,
} from "../../src/internal/runtimeActions.js";

describe("runtimeActions", () => {
  it.each(["setMenuPage", "setMenuEntryPoint"])(
    "does not add placeholder text to %s",
    (mode) => {
      const valueField = createRuntimeActionForm(mode).fields.find(
        (field) => field.name === "value",
      );

      expect(valueField).not.toHaveProperty("placeholder");
    },
  );

  it("uses the existing setMenuEntryPoint value as the form default", () => {
    expect(
      createRuntimeActionDefaultValues("setMenuEntryPoint", {
        value: "pause-menu",
      }),
    ).toEqual({
      valueSource: "fixed",
      value: "pause-menu",
    });
  });

  it("offers the default template's menu pages as predefined values, or a custom one", () => {
    const fields = createRuntimeActionForm("setMenuPage").fields;
    expect(fields.map(({ name, type }) => [name, type])).toEqual([
      ["valueSource", "segmented-control"],
      ["valueChoice", "segmented-control"],
      ["presetValue", "select"],
      ["value", "input-text"],
    ]);
    expect(fields[1]).toMatchObject({
      $when: "values.valueSource == 'fixed'",
      label: "Value",
      options: [
        { label: "Predefined", value: "predefined" },
        { label: "Custom", value: "custom" },
      ],
    });
    expect(fields[2]).toMatchObject({
      $when:
        "values.valueSource == 'fixed' && values.valueChoice == 'predefined'",
      clearable: false,
      options: [
        { label: "Options", value: "options" },
        { label: "Save", value: "save" },
        { label: "Load", value: "load" },
      ],
    });
    expect(fields[3].$when).toBe(
      "values.valueSource == 'fixed' && values.valueChoice == 'custom'",
    );
  });

  it.each([
    [{}, "predefined", "options"],
    [{ value: "save" }, "predefined", "save"],
    [{ value: "settings" }, "custom", "options"],
  ])("opens setMenuPage %o as %s", (action, valueChoice, presetValue) => {
    expect(
      createRuntimeActionDefaultValues("setMenuPage", action),
    ).toMatchObject({ valueSource: "fixed", valueChoice, presetValue });
  });

  it("saves the predefined or the custom menu page, as the choice says", () => {
    const submit = (values) =>
      createRuntimeActionSubmitDetail("setMenuPage", {
        valueSource: "fixed",
        presetValue: "load",
        value: "settings",
        ...values,
      });

    expect(submit({ valueChoice: "predefined" })).toEqual({
      setMenuPage: { value: "load" },
    });
    expect(submit({ valueChoice: "custom" })).toEqual({
      setMenuPage: { value: "settings" },
    });
    expect(submit({ valueSource: "event" })).toEqual({
      setMenuPage: { value: "_event.value" },
    });
    expect(
      createRuntimeActionPreview("setMenuPage", { value: "options" }).summary,
    ).toBe("Set Current Menu Page: Options");
    expect(
      createRuntimeActionPreview("setMenuPage", { value: "settings" }).summary,
    ).toBe("Set Current Menu Page: settings");
  });

  it("shows a value source segmented control for runtime value actions", () => {
    expect(createRuntimeActionForm("setMusicVolume")).toMatchObject({
      fields: [
        {
          name: "valueSource",
          type: "segmented-control",
          label: "Set To",
          options: [
            { label: "Specific Value", value: "fixed" },
            { label: "Current Value", value: "event" },
          ],
        },
        {
          name: "value",
          $when: "values.valueSource == 'fixed'",
          type: "input-number",
        },
      ],
    });
  });

  it("defaults event-bound runtime actions to event value mode", () => {
    const defaultValues = createRuntimeActionDefaultValues("setMusicVolume", {
      value: "_event.value",
    });

    expect(defaultValues).toEqual({
      valueSource: "event",
      value: getRuntimeActionDefinition("setMusicVolume").defaultValue,
    });
  });

  it("submits event-bound runtime actions using _event.value", () => {
    expect(
      createRuntimeActionSubmitDetail("setMusicVolume", {
        valueSource: "event",
        value: 25,
      }),
    ).toEqual({
      setMusicVolume: {
        value: "_event.value",
      },
    });
  });

  it("renders event-bound runtime actions with a friendly preview", () => {
    expect(
      createRuntimeActionPreview("setMusicVolume", {
        value: "_event.value",
      }),
    ).toMatchObject({
      summary: "Set Music Volume: Current Value",
    });
  });
});
