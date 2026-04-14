import { describe, expect, it } from "vitest";
import {
  createRuntimeActionDefaultValues,
  createRuntimeActionForm,
  createRuntimeActionPreview,
  createRuntimeActionSubmitDetail,
  getRuntimeActionDefinition,
} from "../../src/internal/runtimeActions.js";

describe("runtimeActions", () => {
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
