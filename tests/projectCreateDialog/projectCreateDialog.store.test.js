import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  syncFromProps,
  setLocationPreview,
} from "../../src/components/projectCreateDialog/projectCreateDialog.store.js";
import { EN_I18N } from "../support/i18n.js";

describe("projectCreateDialog.store", () => {
  it("shows the iOS destination separately from the desktop folder picker", () => {
    const state = createInitialState();
    syncFromProps({ state }, { props: { platform: "ios" } });
    setLocationPreview(
      { state },
      {
        location: {
          folderName: "Project One",
          displayPath: "On My iPhone / RouteVN Projects / Project One",
        },
      },
    );
    const view = selectViewData({ state, i18n: EN_I18N });
    expect(view.platform).toBe("ios");
    expect(view.projectLocationPrefix).toBe("On My iPhone/RouteVN Projects");
    expect(view.projectLocation.folderName).toBe("Project One");
    expect(
      view.form.fields.find(({ name }) => name === "iosProjectLocation"),
    ).toMatchObject({ $when: "platform == 'ios'", label: "Project Location" });
    expect(
      view.form.fields.find(({ name }) => name === "projectPath"),
    ).toMatchObject({ $when: "platform == 'tauri'" });
  });

  it("does not expose portrait resolution in the create project form", () => {
    const state = createInitialState();
    const viewData = selectViewData({ state, i18n: EN_I18N });
    const resolutionField = viewData.form.fields.find(
      (field) => field.name === "resolution",
    );

    expect(resolutionField.options).toContainEqual({
      value: "1920x1080",
      label: "1920x1080",
    });
    expect(resolutionField.options).not.toContainEqual({
      value: "1080x1920",
      label: "1080x1920",
    });
  });

  it("offers the supported project languages for writing count goals", () => {
    const state = createInitialState();
    const viewData = selectViewData({ state, i18n: EN_I18N });
    const languageField = viewData.form.fields.find(
      (field) => field.name === "language",
    );

    expect(languageField).toEqual({
      name: "language",
      type: "select",
      label: "Project Language",
      description:
        "This language determines whether writing goals use word or character counts.",
      required: true,
      clearable: false,
      searchable: true,
      searchPlaceholder: "Search languages...",
      emptySearchLabel: "No languages found",
      options: [
        { value: "en", label: "English", suffixText: "en" },
        { value: "es", label: "Spanish", suffixText: "es" },
        { value: "pt", label: "Portuguese", suffixText: "pt" },
        { value: "ru", label: "Russian", suffixText: "ru" },
        { value: "ja", label: "Japanese", suffixText: "ja" },
        {
          value: "zh-Hans",
          label: "Chinese - Simplified",
          suffixText: "zh-Hans",
        },
        {
          value: "zh-Hant",
          label: "Chinese - Traditional",
          suffixText: "zh-Hant",
        },
        { value: "ko", label: "Korean", suffixText: "ko" },
        { value: "fr", label: "French", suffixText: "fr" },
        { value: "it", label: "Italian", suffixText: "it" },
        { value: "ar", label: "Arabic", suffixText: "ar" },
        { value: "uk", label: "Ukrainian", suffixText: "uk" },
        { value: "bn", label: "Bangla/Bengali", suffixText: "bn" },
        { value: "hi", label: "Hindi", suffixText: "hi" },
        { value: "ur", label: "Urdu", suffixText: "ur" },
        { value: "id", label: "Indonesian", suffixText: "id" },
        { value: "ms", label: "Malaysian", suffixText: "ms" },
        { value: "th", label: "Thai", suffixText: "th" },
        { value: "vi", label: "Vietnamese", suffixText: "vi" },
        { value: "fil", label: "Filipino", suffixText: "fil" },
        { value: "de", label: "German", suffixText: "de" },
        { value: "mr", label: "Marathi", suffixText: "mr" },
        { value: "te", label: "Telugu", suffixText: "te" },
        { value: "tr", label: "Turkish", suffixText: "tr" },
        { value: "ta", label: "Tamil", suffixText: "ta" },
        { value: "fa", label: "Persian/Farsi", suffixText: "fa" },
        { value: "sw", label: "Swahili", suffixText: "sw" },
        { value: "ha", label: "Hausa", suffixText: "ha" },
        {
          value: "pa-Guru",
          label: "Punjabi - Gurmukhi",
          suffixText: "pa-Guru",
        },
        { value: "gu", label: "Gujarati", suffixText: "gu" },
        { value: "pl", label: "Polish", suffixText: "pl" },
        { value: "nl", label: "Dutch", suffixText: "nl" },
      ],
    });
    expect(viewData.defaultValues.language).toBe("en");
  });

  it("uses the form-owned sticky submit action", () => {
    const state = createInitialState();
    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.form).not.toHaveProperty("sticky");
    expect(viewData.form.actions).toEqual({
      buttons: [
        {
          id: "submit",
          variant: "pr",
          validate: true,
          label: "Submit",
        },
      ],
    });
  });
});
