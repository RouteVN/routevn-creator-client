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
        { value: "te", label: "Telugu" },
        { value: "es", label: "Spanish" },
        { value: "tr", label: "Turkish" },
        { value: "zh-Hans", label: "Chinese — Simplified" },
        { value: "ta", label: "Tamil" },
        { value: "zh-Hant", label: "Chinese — Traditional" },
        { value: "vi", label: "Vietnamese" },
        { value: "hi", label: "Hindi" },
        { value: "ko", label: "Korean" },
        { value: "ar", label: "Arabic" },
        { value: "fa", label: "Persian/Farsi" },
        { value: "fr", label: "French" },
        { value: "it", label: "Italian" },
        { value: "pt", label: "Portuguese" },
        { value: "sw", label: "Swahili" },
        { value: "bn", label: "Bangla/Bengali" },
        { value: "ha", label: "Hausa" },
        { value: "ru", label: "Russian" },
        { value: "pa-Guru", label: "Punjabi — Gurmukhi" },
        { value: "ur", label: "Urdu" },
        { value: "gu", label: "Gujarati" },
        { value: "id", label: "Indonesian" },
        { value: "th", label: "Thai" },
        { value: "de", label: "German" },
        { value: "fil", label: "Filipino" },
        { value: "ja", label: "Japanese" },
        { value: "pl", label: "Polish" },
        { value: "mr", label: "Marathi" },
        { value: "uk", label: "Ukrainian" },
        { value: "nl", label: "Dutch" },
        { value: "ms", label: "Bahasa Melayu" },
      ],
    });
    expect(viewData.defaultValues.language).toBe("en");
  });
});
