import { describe, expect, it } from "vitest";
import {
  createInitialState,
  openEditDialog,
  selectProjectAnalyticsRequestId,
  selectViewData,
  setCurrentProject,
  setProjectAnalytics,
  setProjectAnalyticsRequestId,
  setSceneTextAnalyticsStatus,
} from "../../src/pages/project/project.store.js";
import { EN_I18N } from "../support/i18n.js";

describe("project page store", () => {
  it("tracks the latest project analytics request", () => {
    const state = createInitialState();

    expect(selectProjectAnalyticsRequestId({ state })).toBe(0);
    setProjectAnalyticsRequestId({ state }, { requestId: 2 });
    expect(selectProjectAnalyticsRequestId({ state })).toBe(2);
  });

  it("loads until the first analytics snapshot, including an empty project", () => {
    const state = createInitialState();

    expect(selectViewData({ state, i18n: EN_I18N }).isSceneTextLoading).toBe(
      true,
    );

    setProjectAnalytics({ state }, { analytics: { scenes: [] } });
    setSceneTextAnalyticsStatus({ state }, { status: "ready" });

    const viewData = selectViewData({ state, i18n: EN_I18N });
    expect(viewData.isSceneTextLoading).toBe(false);
    expect(viewData.hasSceneTextError).toBe(false);
    expect(viewData.sceneCount).toBe("0");
  });

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
        { value: "zh-Hans", label: "Chinese - Simplified" },
        { value: "zh-Hant", label: "Chinese - Traditional" },
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
        { value: "pa-Guru", label: "Punjabi - Gurmukhi" },
        { value: "gu", label: "Gujarati" },
        { value: "pl", label: "Polish" },
        { value: "nl", label: "Dutch" },
      ],
    });
    expect(viewData.editDefaultValues.language).toBe("ja");
  });

  it("formats localized resource and scene analytics", () => {
    const state = createInitialState();
    setProjectAnalytics(
      { state },
      {
        analytics: {
          resourceGroups: [
            {
              key: "assets",
              resources: [
                { key: "images", count: 12 },
                { key: "characters", count: 1 },
              ],
            },
          ],
          characterResources: [
            {
              id: "character-1",
              name: "Hero",
              spriteCount: 6,
            },
          ],
          scenes: [
            {
              id: "scene-1",
              name: "Opening",
              textStats: {
                wordCount: 1_234,
                characterCount: 5_678,
                language: "en",
              },
            },
          ],
        },
      },
    );
    setSceneTextAnalyticsStatus({ state }, { status: "ready" });

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.resourceGroups).toEqual([
      {
        key: "assets",
        label: "Assets",
        resources: [
          { key: "images", label: "Images", count: "12" },
          { key: "characters", label: "Characters", count: "1" },
        ],
      },
    ]);
    expect(viewData.characterResources).toEqual([
      {
        id: "character-1",
        name: "Hero",
        spriteCount: "6",
      },
    ]);
    expect(viewData.sceneTextStats).toEqual([
      {
        id: "scene-1",
        name: "Opening",
        textCount: "1,234",
      },
    ]);
    expect(viewData.sceneTextCountLabel).toBe("Words");
    expect(viewData.sceneCount).toBe("1");
    expect(viewData.sceneCountLabel).toBe("Total Scenes");
    expect(viewData.totalTextCount).toBe("1,234");
    expect(viewData.totalTextCountLabel).toBe("Total Words");
    expect(viewData.isSceneTextLoading).toBe(false);

    setCurrentProject(
      { state },
      {
        project: {
          language: "ja",
        },
      },
    );

    const staleLanguageViewData = selectViewData({ state, i18n: EN_I18N });

    expect(staleLanguageViewData.sceneTextStats).toEqual([]);
    expect(staleLanguageViewData.sceneCount).toBe("1");
    expect(staleLanguageViewData.isSceneTextLoading).toBe(true);

    setProjectAnalytics(
      { state },
      {
        analytics: {
          scenes: [
            {
              id: "scene-1",
              name: "Opening",
              textStats: {
                wordCount: 1_234,
                characterCount: 5_678,
                language: "ja",
              },
            },
          ],
        },
      },
    );

    const japaneseViewData = selectViewData({ state, i18n: EN_I18N });

    expect(japaneseViewData.sceneTextStats[0].textCount).toBe("5,678");
    expect(japaneseViewData.sceneTextCountLabel).toBe("Characters");
    expect(japaneseViewData.totalTextCount).toBe("5,678");
    expect(japaneseViewData.totalTextCountLabel).toBe("Total Characters");
    expect(japaneseViewData.isSceneTextLoading).toBe(false);
  });

  it("keeps loading while scene text statistics are missing", () => {
    const state = createInitialState();
    setProjectAnalytics(
      { state },
      {
        analytics: {
          scenes: [
            {
              id: "scene-1",
              name: "Opening",
              textStats: undefined,
            },
          ],
        },
      },
    );

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.sceneCount).toBe("1");
    expect(viewData.sceneTextStats).toEqual([]);
    expect(viewData.totalTextCount).toBe("0");
    expect(viewData.isSceneTextLoading).toBe(true);
  });

  it("stops loading when scene text analytics reach an error state", () => {
    const state = createInitialState();
    setProjectAnalytics(
      { state },
      {
        analytics: {
          scenes: [
            {
              id: "scene-1",
              name: "Opening",
              textStats: undefined,
            },
          ],
        },
      },
    );
    setSceneTextAnalyticsStatus({ state }, { status: "error" });

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.isSceneTextLoading).toBe(false);
    expect(viewData.hasSceneTextError).toBe(true);
    expect(viewData.sceneTextStats).toEqual([]);
  });
});
