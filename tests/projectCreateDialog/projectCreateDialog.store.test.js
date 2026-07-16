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
    expect(viewData.defaultValues.language).toBe("en");
  });
});
