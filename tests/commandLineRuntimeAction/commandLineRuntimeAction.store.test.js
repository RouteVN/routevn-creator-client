import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setAction,
  setFormValues,
  setMode,
} from "../../src/components/commandLineRuntimeAction/commandLineRuntimeAction.store.js";

describe("commandLineRuntimeAction.store", () => {
  it("builds dialogue text speed view data used by the extracted scene-editor action editor", () => {
    const state = createInitialState();

    setMode({ state }, { mode: "setDialogueTextSpeed" });
    setAction(
      { state },
      {
        action: {
          value: 65,
        },
      },
    );

    const viewData = selectViewData({ state });

    expect(viewData.breadcrumb).toEqual([
      {
        id: "actions",
        label: "Actions",
        click: true,
      },
      {
        label: "Set Dialogue Text Speed",
      },
    ]);
    expect(viewData.defaultValues).toEqual({
      valueSource: "fixed",
      value: 65,
    });
    expect(viewData.form.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "valueSource",
          type: "segmented-control",
        }),
        expect.objectContaining({
          name: "value",
          type: "input-number",
          min: 0,
          step: 1,
        }),
      ]),
    );
    expect(viewData.formKey).toBe("setDialogueTextSpeed-fixed");
  });

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
