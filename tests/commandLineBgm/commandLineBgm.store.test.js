import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectBgm,
  selectViewData,
  setBgm,
} from "../../src/components/commandLineBgm/commandLineBgm.store.js";

describe("commandLineBgm.store", () => {
  it("uses a 0 to 100 volume range with a default of 50", () => {
    const state = createInitialState();

    const viewData = selectViewData({ state });
    const volumeField = viewData.form.fields.find(
      (field) => field.name === "volume",
    );

    expect(volumeField).toMatchObject({
      min: 0,
      max: 100,
      step: 1,
    });
    expect(viewData.defaultValues.volume).toBe(50);
  });

  it("normalizes legacy 0 to 1000 BGM volume values into the 0 to 100 UI range", () => {
    const state = createInitialState();

    setBgm(
      { state },
      {
        bgm: {
          resourceId: "sound-1",
          volume: 500,
        },
      },
    );

    expect(selectBgm({ state }).volume).toBe(50);
    expect(selectViewData({ state }).defaultValues.volume).toBe(50);
  });
});
