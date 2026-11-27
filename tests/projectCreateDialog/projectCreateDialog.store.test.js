import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectTemplate,
  selectViewData,
  setTemplate,
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

  it("shows the template first, with the bundled one named in the app's language", () => {
    const state = createInitialState();
    let viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.form.fields[0]).toEqual({
      name: "projectTemplate",
      type: "slot",
      slot: "project-template-selector",
      label: "Template",
    });
    // The bundled template shows its title screen.
    expect(viewData.projectTemplate).toEqual({
      title: "Default",
      coverUrl: "/templates/default/cover.webp",
    });
    expect(viewData.changeTemplateLabel).toBe("Change");

    expect(viewData.context.chooseResolution).toBe(true);

    // A store template shows the one resolution it is made for, which the
    // form then has no field to choose.
    const template = {
      id: "template-one",
      source: "store",
      title: "Template One",
      coverUrl: "https://files.example/template-one.png",
      resolution: { width: 1280, height: 720 },
    };
    syncFromProps({ state }, { props: { projectTemplate: template } });
    viewData = selectViewData({ state, i18n: EN_I18N });
    expect(viewData.projectTemplate).toEqual({
      title: "Template One",
      coverUrl: "https://files.example/template-one.png",
      resolution: "1280 × 720",
    });
    expect(viewData.context.chooseResolution).toBe(false);
    expect(
      viewData.form.fields
        .filter(({ name }) => name.startsWith("resolution"))
        .map(({ $when }) => $when),
    ).toEqual([
      "chooseResolution",
      "chooseResolution && values.resolution == 'custom'",
      "chooseResolution && values.resolution == 'custom'",
    ]);
    expect(selectTemplate({ state })).toBe(template);
  });

  it("changes the template without resetting the typed values", () => {
    const state = createInitialState();
    state.defaultValues.name = "Project One";

    setTemplate({ state }, { template: { id: "default", source: "bundled" } });

    expect(selectTemplate({ state })).toEqual({
      id: "default",
      source: "bundled",
    });
    expect(state.defaultValues.name).toBe("Project One");
  });
});
