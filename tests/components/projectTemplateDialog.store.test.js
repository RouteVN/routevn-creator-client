import { describe, expect, it } from "vitest";
import * as dialogStore from "../../src/components/projectTemplateDialog/projectTemplateDialog.store.js";
import { EN_I18N, JA_I18N } from "../support/i18n.js";

const creator = {
  id: "creator-1",
  name: "Creator One",
  avatarUrl: "https://files.example/avatar.png",
};

const card = (id, overrides = {}) => ({
  id,
  title: `Template ${id}`,
  summary: "A starter project.",
  coverUrl: `https://files.example/${id}.png`,
  resolution: { width: 1920, height: 1080 },
  languages: ["en", "ja"],
  releasedAt: Date.UTC(2026, 10, 14),
  creator,
  ...overrides,
});

const screenshot = (name, alt = "") => ({
  url: `https://files.example/${name}.png`,
  width: 1920,
  height: 1080,
  alt,
});

const template = (id) => ({
  ...card(id),
  description: [{ text: "First paragraph." }],
  screenshots: [
    screenshot("title", "Title screen"),
    screenshot("dialogue"),
    screenshot("menu", "Menu"),
  ],
  versionName: "1.2.0",
  updatedAt: Date.UTC(2026, 10, 19),
});

const createStore = (i18n = EN_I18N) => {
  const state = dialogStore.createInitialState();
  const store = Object.fromEntries(
    Object.entries(dialogStore)
      .filter(([name]) => name !== "createInitialState")
      .map(([name, fn]) => [name, (payload) => fn({ state, i18n }, payload)]),
  );
  return { state, store };
};

describe("projectTemplateDialog store", () => {
  it("shows the bundled template first while the store's first page loads", () => {
    const { store } = createStore();
    store.syncFromProps({ props: { open: true } });
    store.startCatalogLoad({ requestId: "request-1" });

    const view = store.selectViewData();
    expect(view.isListStep).toBe(true);
    expect(view.defaultTemplate).toEqual({
      id: "default",
      title: "Default",
      summary: "A title screen, a prologue and ready-made menus to build on.",
      openLabel: "Open Default",
    });
    expect(view.templates).toEqual([]);
    expect(view.placeholderCards).toHaveLength(3);
    expect(view.isCatalogLoading).toBe(true);
    expect(view.hasMoreTemplates).toBe(false);
  });

  it("shows store templates as cards, with Load More while pages remain", () => {
    const { store } = createStore();
    store.startCatalogLoad({ requestId: "request-1" });
    store.setCatalogPage({ templates: [card("one")], nextCursor: "1" });

    let view = store.selectViewData();
    expect(view.templates).toEqual([
      {
        id: "one",
        title: "Template one",
        summary: "A starter project.",
        coverUrl: "https://files.example/one.png",
        creatorName: "Creator One",
        creatorAvatarUrl: "https://files.example/avatar.png",
        openLabel: "Open Template one",
      },
    ]);
    expect(view.placeholderCards).toEqual([]);
    expect(view.hasMoreTemplates).toBe(true);

    // The next page keeps the first and shows its loading under it.
    store.startCatalogLoad({ requestId: "request-2", cursor: "1" });
    view = store.selectViewData();
    expect(view.templates).toHaveLength(1);
    expect(view.isLoadingMore).toBe(true);
    expect(view.hasMoreTemplates).toBe(false);

    store.setCatalogPage({ templates: [card("two")], nextCursor: undefined });
    view = store.selectViewData();
    expect(view.templates.map(({ id }) => id)).toEqual(["one", "two"]);
    expect(view.isLoadingMore).toBe(false);
    expect(view.hasMoreTemplates).toBe(false);
  });

  it("keeps the cards and the cursor to retry when a later page fails", () => {
    const { store } = createStore();
    store.startCatalogLoad({ requestId: "request-1" });
    store.setCatalogPage({ templates: [card("one")], nextCursor: "1" });
    store.startCatalogLoad({ requestId: "request-2", cursor: "1" });
    store.setCatalogError({ cursor: "1" });

    const view = store.selectViewData();
    expect(view.isCatalogFailed).toBe(true);
    expect(view.catalogFailedLabel).toBe(
      "Templates could not be loaded. Check your connection and try again.",
    );
    expect(view.templates).toHaveLength(1);
    expect(store.selectCatalogFailedCursor()).toBe("1");
  });

  it("opens a template's page from its card while its details load", () => {
    const { store } = createStore();
    store.startCatalogLoad({ requestId: "request-1" });
    store.setCatalogPage({ templates: [card("one")] });
    store.openDetail({
      requestId: "detail-1",
      card: store.selectCatalogTemplateById({ templateId: "one" }),
    });

    const view = store.selectViewData();
    expect(view.isDetailStep).toBe(true);
    expect(view.detail).toMatchObject({
      title: "Template one",
      isLoading: true,
      isLoaded: false,
      useDisabled: true,
      screenshots: [],
      hasMultipleScreenshots: false,
      description: [],
      resolution: "1920 × 1080",
      languages: "English, Japanese",
      released: "Nov 14, 2026",
    });
    // The cover stands in for the screenshots.
    expect(view.detail.viewerImage).toEqual({
      url: "https://files.example/one.png",
      alt: "Template one",
      width: 16,
      height: 9,
    });
    expect(view.detail.versionName).toBeUndefined();
    expect(view.detail.updated).toBeUndefined();
  });

  it("shows the loaded screenshots and moves through them, going around", () => {
    const { store } = createStore();
    store.openDetail({ requestId: "detail-1", card: card("one") });
    store.setDetail({ template: template("one") });

    let view = store.selectViewData();
    expect(view.detail.useDisabled).toBe(false);
    expect(view.detail.versionName).toBe("1.2.0");
    expect(view.detail.updated).toBe("Nov 19, 2026");
    expect(view.detail.hasMultipleScreenshots).toBe(true);
    // A screenshot without its own alt text is numbered.
    expect(view.detail.screenshots.map(({ alt }) => alt)).toEqual([
      "Title screen",
      "Screenshot 2",
      "Menu",
    ]);
    expect(view.detail.screenshots.map(({ isSelected }) => isSelected)).toEqual(
      [true, false, false],
    );

    store.moveScreenshot({ offset: -1 });
    view = store.selectViewData();
    expect(view.detail.viewerImage).toEqual({
      url: "https://files.example/menu.png",
      alt: "Menu",
      width: 1920,
      height: 1080,
    });

    store.moveScreenshot({ offset: 1 });
    expect(store.selectScreenshotIndex()).toBe(0);
    store.setScreenshotIndex({ index: 1 });
    expect(store.selectViewData().detail.viewerImage.alt).toBe("Screenshot 2");
  });

  it("lists only the languages it can name, in the app's language", () => {
    const { store } = createStore(JA_I18N);
    store.openDetail({
      requestId: "detail-1",
      card: card("one", { languages: ["ja", "xx-Unknown", "en"] }),
    });

    expect(store.selectViewData().detail.languages).toBe("日本語、英語");
  });

  it("starts again on a fresh list when it reopens", () => {
    const { store } = createStore();
    store.syncFromProps({ props: { open: true } });
    store.startCatalogLoad({ requestId: "request-1" });
    store.setCatalogPage({ templates: [card("one")] });
    store.openDetail({ requestId: "detail-1", card: card("one") });

    store.syncFromProps({ props: { open: false } });
    expect(store.selectViewData().isDetailStep).toBe(true);
    store.syncFromProps({ props: { open: true } });

    const view = store.selectViewData();
    expect(view.isListStep).toBe(true);
    expect(view.templates).toEqual([]);
    expect(store.selectDetailRequestId()).toBeUndefined();
  });
});
