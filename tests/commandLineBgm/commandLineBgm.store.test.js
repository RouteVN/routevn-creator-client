import { describe, expect, it } from "vitest";
import {
  clearBgmAudio,
  createInitialState,
  selectBgm,
  selectViewData,
  setBgm,
} from "../../src/components/commandLineBgm/commandLineBgm.store.js";

const i18n = {
  resourcePages: {},
  sceneEditorPage: {},
  commandLinePage: {},
};

describe("commandLineBgm.store", () => {
  it("uses a 0 to 100 volume range with a default of 75", () => {
    const state = createInitialState();

    const viewData = selectViewData({ state, i18n });
    const volumeField = viewData.form.fields.find(
      (field) => field.name === "volume",
    );

    expect(volumeField).toMatchObject({
      min: 0,
      max: 100,
      step: 1,
    });
    expect(viewData.defaultValues.volume).toBe(75);
    expect(Object.hasOwn(state.bgm, "resourceId")).toBe(false);
    expect(Object.hasOwn(state.bgm, "startDelayMs")).toBe(false);
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
    expect(selectViewData({ state, i18n }).defaultValues.volume).toBe(50);
  });

  it("omits optional BGM fields when they are not selected", () => {
    const state = createInitialState();
    setBgm(
      { state },
      {
        bgm: {
          resourceId: "sound-1",
          loop: true,
          volume: 75,
          startDelayMs: 250,
        },
      },
    );

    clearBgmAudio({ state });
    expect(Object.hasOwn(state.bgm, "resourceId")).toBe(false);
    expect(state.bgm.startDelayMs).toBe(250);

    setBgm(
      { state },
      {
        bgm: {
          ...state.bgm,
          resourceId: undefined,
          startDelayMs: undefined,
        },
      },
    );

    expect(selectBgm({ state })).toEqual({ loop: true, volume: 75 });
    expect(Object.hasOwn(state.bgm, "resourceId")).toBe(false);
    expect(Object.hasOwn(state.bgm, "startDelayMs")).toBe(false);
  });
});
