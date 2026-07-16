import { describe, expect, it } from "vitest";
import {
  createInitialState,
  openEditDialog,
  selectViewData,
  setCurrentProject,
} from "../../src/pages/project/project.store.js";
import { EN_I18N } from "../support/i18n.js";

describe("project page store", () => {
  it("shows project language in detail and the edit form", () => {
    const state = createInitialState();
    setCurrentProject(
      { state },
      {
        project: {
          name: "Project One",
          description: "Project description",
          language: "ja",
          resolution: { width: 1920, height: 1080 },
        },
      },
    );
    openEditDialog({ state });

    const viewData = selectViewData({ state, i18n: EN_I18N });
    const languageDetail = viewData.detailFields.find(
      (field) => field.label === "Project Language",
    );
    const languageField = viewData.editForm.fields.find(
      (field) => field.name === "language",
    );

    expect(languageDetail).toEqual({
      type: "slot",
      slot: "project-language",
      label: "Project Language",
    });
    expect(viewData.projectLanguage).toBe("Japanese");
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
    expect(viewData.editDefaultValues.language).toBe("ja");
  });
});
