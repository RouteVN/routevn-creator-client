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
        { value: "ja", label: "Japanese" },
        { value: "ko", label: "Korean" },
        { value: "zh-hans", label: "Simplified Chinese" },
        { value: "zh-hant", label: "Traditional Chinese" },
        { value: "ru", label: "Russian" },
        { value: "it", label: "Italian" },
        { value: "de", label: "German" },
        { value: "fr", label: "French" },
        { value: "es", label: "Spanish" },
        { value: "nl", label: "Dutch" },
        { value: "th", label: "Thai" },
        { value: "ms", label: "Bahasa Melayu" },
        { value: "id", label: "Bahasa Indonesia" },
        { value: "pt", label: "Portuguese" },
      ],
    });
    expect(viewData.editDefaultValues.language).toBe("ja");
  });
});
