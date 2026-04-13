import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setAction,
  setFormValues,
  setMode,
} from "../../src/components/commandLineRuntimeAction/commandLineRuntimeAction.store.js";

describe("commandLineRuntimeAction.store", () => {
  it("provides form context and a reactive key for conditional value fields", () => {
    const state = createInitialState();

    setMode({ state }, { mode: "setMusicVolume" });
    setAction(
      { state },
      {
        action: {
          value: "_event.value",
        },
      },
    );

    const eventViewData = selectViewData({ state });

    expect(eventViewData.defaultValues).toEqual({
      valueSource: "event",
      value: 500,
    });
    expect(eventViewData.context).toEqual({
      values: eventViewData.defaultValues,
    });
    expect(eventViewData.formKey).toBe("setMusicVolume-event");

    setFormValues(
      { state },
      {
        values: {
          valueSource: "fixed",
          value: 42,
        },
      },
    );

    const fixedViewData = selectViewData({ state });

    expect(fixedViewData.defaultValues).toEqual({
      valueSource: "fixed",
      value: 42,
    });
    expect(fixedViewData.formKey).toBe("setMusicVolume-fixed");
  });
});
