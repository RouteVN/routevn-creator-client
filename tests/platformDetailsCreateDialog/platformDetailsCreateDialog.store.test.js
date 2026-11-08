import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setIconFileId,
  setOptionalIconFileId,
  openIconCropDialog,
  syncFromProps,
} from "../../src/components/platformDetailsCreateDialog/platformDetailsCreateDialog.store.js";
import { EN_I18N } from "../support/i18n.js";

describe("Android platform setup form", () => {
  it("selects crop size and guide for each optional image and removes it", () => {
    const state = createInitialState();
    syncFromProps(
      { state },
      { props: { platform: "android", applicationInfo: {} } },
    );
    openIconCropDialog({ state }, { file: {}, target: "adaptive" });
    let view = selectViewData({ state, i18n: EN_I18N });
    expect(view.guideCircle).toBe(66 / 72);
    expect(view.iconOutputSize).toBe(512);
    setOptionalIconFileId(
      { state },
      { target: "adaptive", fileId: "adaptive-1" },
    );
    expect(selectViewData({ state, i18n: EN_I18N }).adaptiveIconFileId).toBe(
      "adaptive-1",
    );
    setOptionalIconFileId({ state }, { target: "adaptive", fileId: undefined });
    expect(
      selectViewData({ state, i18n: EN_I18N }).adaptiveIconFileId,
    ).toBeUndefined();
    openIconCropDialog({ state }, { file: {}, target: "splash" });
    view = selectViewData({ state, i18n: EN_I18N });
    expect(view.guideCircle).toBe(1);
    expect(view.iconOutputSize).toBe(768);
  });
  it("prefills default colors and preserves them when the icon is cropped", () => {
    const state = createInitialState();
    syncFromProps(
      { state },
      {
        props: {
          platform: "android",
          applicationInfo: {
            applicationName: "Project One",
            applicationIdentifier: "",
            iconFileId: "icon-1",
          },
        },
      },
    );
    let view = selectViewData({ state, i18n: EN_I18N });
    expect(view.defaultValues).toEqual({
      applicationName: "Project One",
      applicationIdentifier: "",
      iconBackgroundColor: "#FFFFFF",
      splashBackgroundColor: "#000000",
    });
    expect(view.iconOutputSize).toBe(512);
    setIconFileId({ state }, { iconFileId: "icon-2" });
    view = selectViewData({ state, i18n: EN_I18N });
    expect(view.iconFileId).toBe("icon-2");
    expect(view.defaultValues.iconBackgroundColor).toBe("#FFFFFF");
    expect(
      view.form.fields.filter((field) => field.type === "color-picker"),
    ).toHaveLength(2);
  });
});
