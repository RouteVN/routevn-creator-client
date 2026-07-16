import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
} from "../../src/components/projectCreateDialog/projectCreateDialog.store.js";
import { EN_I18N } from "../support/i18n.js";

describe("projectCreateDialog.store", () => {
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
        { value: "en", label: "English" },
        { value: "ja", label: "Japanese" },
        { value: "zh-Hans", label: "Chinese — Simplified" },
        { value: "zh-Hant", label: "Chinese — Traditional" },
        { value: "ko", label: "Korean" },
        { value: "es", label: "Spanish" },
        { value: "fr", label: "French" },
        { value: "it", label: "Italian" },
        { value: "pt", label: "Portuguese" },
        { value: "ar", label: "Arabic" },
        { value: "ru", label: "Russian" },
        { value: "uk", label: "Ukrainian" },
        { value: "bn", label: "Bangla/Bengali" },
        { value: "hi", label: "Hindi" },
        { value: "ur", label: "Urdu" },
        { value: "id", label: "Indonesian" },
        { value: "ms", label: "Malaysian" },
        { value: "th", label: "Thai" },
        { value: "vi", label: "Vietnamese" },
        { value: "fil", label: "Filipino" },
        { value: "de", label: "German" },
        { value: "mr", label: "Marathi" },
        { value: "te", label: "Telugu" },
        { value: "tr", label: "Turkish" },
        { value: "ta", label: "Tamil" },
        { value: "fa", label: "Persian/Farsi" },
        { value: "sw", label: "Swahili" },
        { value: "ha", label: "Hausa" },
        { value: "pa-Guru", label: "Punjabi — Gurmukhi" },
        { value: "gu", label: "Gujarati" },
        { value: "pl", label: "Polish" },
        { value: "nl", label: "Dutch" },
      ],
    });
    expect(viewData.defaultValues.language).toBe("en");
  });
});
