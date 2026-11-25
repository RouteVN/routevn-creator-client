import { describe, expect, it, vi } from "vitest";
import * as handlers from "../../src/components/projectTemplateDialog/projectTemplateDialog.handlers.js";
import * as dialogStore from "../../src/components/projectTemplateDialog/projectTemplateDialog.store.js";
import { EN_I18N } from "../support/i18n.js";

const creator = { id: "creator-1", name: "Creator One" };

const card = (id) => ({
  id,
  title: `Template ${id}`,
  summary: "A starter project.",
  coverUrl: `https://files.example/${id}.png`,
  resolution: { width: 1920, height: 1080 },
  languages: ["en"],
  creator,
});

const template = (id) => ({
  ...card(id),
  description: [],
  screenshots: ["one", "two", "three"].map((name) => ({
    url: `https://files.example/${name}.png`,
    thumbnailUrl: `https://files.example/${name}-small.png`,
  })),
});

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const createDeps = (appService = {}) => {
  const state = dialogStore.createInitialState();
  const store = Object.fromEntries(
    Object.entries(dialogStore)
      .filter(([name]) => name !== "createInitialState")
      .map(([name, fn]) => [
        name,
        (payload) => fn({ state, i18n: EN_I18N }, payload),
      ]),
  );
  return {
    state,
    store,
    appService,
    props: { open: true },
    render: vi.fn(),
    dispatchEvent: vi.fn(),
    i18n: EN_I18N,
  };
};

// An event whose composed path holds an element with `dataset`.
const eventOn = (dataset, extra = {}) => ({
  composedPath: () => [{ dataset }, { dataset: {} }],
  preventDefault: vi.fn(),
  ...extra,
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const dispatched = (deps) =>
  deps.dispatchEvent.mock.calls.map(([event]) => ({
    type: event.type,
    detail: event.detail,
  }));

describe("projectTemplateDialog handlers", () => {
  it("loads the first page when it opens, and drops a page answered after a newer request", async () => {
    const pages = [];
    const listProjectTemplates = vi.fn(() => {
      const page = deferred();
      pages.push(page);
      return page.promise;
    });
    const deps = createDeps({ listProjectTemplates });

    handlers.handleBeforeMount(deps);
    await handlers.handleOnUpdate(deps, {
      oldProps: { open: true },
      newProps: { open: false },
    });
    const reopened = handlers.handleOnUpdate(deps, {
      oldProps: { open: false },
      newProps: { open: true },
    });
    pages[1].resolve({ templates: [card("new")], nextCursor: undefined });
    await reopened;
    pages[0].resolve({ templates: [card("old")], nextCursor: undefined });
    await settle();

    expect(listProjectTemplates).toHaveBeenCalledTimes(2);
    expect(listProjectTemplates).toHaveBeenCalledWith({ cursor: undefined });
    expect(deps.store.selectViewData().templates.map(({ id }) => id)).toEqual([
      "new",
    ]);
  });

  it("loads the next page, and retries the page that failed", async () => {
    const listProjectTemplates = vi
      .fn()
      .mockResolvedValueOnce({ templates: [card("one")], nextCursor: "1" })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ templates: [card("two")] });
    const deps = createDeps({ listProjectTemplates });
    handlers.handleBeforeMount(deps);
    await settle();

    await handlers.handleLoadMoreTemplates(deps);
    expect(listProjectTemplates).toHaveBeenLastCalledWith({ cursor: "1" });
    expect(deps.store.selectViewData().isCatalogFailed).toBe(true);

    await handlers.handleCatalogRetry(deps);
    expect(listProjectTemplates).toHaveBeenLastCalledWith({ cursor: "1" });
    expect(deps.store.selectViewData().templates.map(({ id }) => id)).toEqual([
      "one",
      "two",
    ]);
  });

  it("chooses the bundled template without opening a page", () => {
    const getProjectTemplate = vi.fn();
    const deps = createDeps({ getProjectTemplate });

    handlers.handleTemplateGridClick(deps, {
      _event: eventOn({ templateId: "default" }),
    });

    expect(getProjectTemplate).not.toHaveBeenCalled();
    expect(dispatched(deps)).toEqual([
      {
        type: "template-select",
        detail: { template: { id: "default", source: "bundled" } },
      },
    ]);
  });

  it("opens a store template's page from its card, by click or by Enter", async () => {
    const getProjectTemplate = vi.fn(async ({ templateId }) =>
      template(templateId),
    );
    const deps = createDeps({
      listProjectTemplates: async () => ({ templates: [card("one")] }),
      getProjectTemplate,
    });
    handlers.handleBeforeMount(deps);
    await settle();

    const opening = handlers.handleTemplateGridKeyDown(deps, {
      _event: eventOn({ templateId: "one" }, { key: "Enter" }),
    });
    expect(deps.store.selectViewData().detail.isLoading).toBe(true);
    await opening;

    expect(getProjectTemplate).toHaveBeenCalledWith({ templateId: "one" });
    const { detail } = deps.store.selectViewData();
    expect(detail.isLoaded).toBe(true);
    expect(detail.screenshots).toHaveLength(3);

    // Other keys do nothing.
    handlers.handleTemplateGridKeyDown(deps, {
      _event: eventOn({ templateId: "one" }, { key: "a" }),
    });
    expect(getProjectTemplate).toHaveBeenCalledOnce();
  });

  it("drops a template's details after the user went back, and offers Try Again when they fail", async () => {
    const answers = [];
    const getProjectTemplate = vi.fn(() => {
      const answer = deferred();
      answers.push(answer);
      return answer.promise;
    });
    const deps = createDeps({
      listProjectTemplates: async () => ({
        templates: [card("one"), card("two")],
      }),
      getProjectTemplate,
    });
    handlers.handleBeforeMount(deps);
    await settle();

    const leftPage = handlers.handleTemplateGridClick(deps, {
      _event: eventOn({ templateId: "one" }),
    });
    handlers.handleDetailBack(deps);
    answers[0].resolve(template("one"));
    await leftPage;
    expect(deps.store.selectViewData().isListStep).toBe(true);

    const opened = handlers.handleTemplateGridClick(deps, {
      _event: eventOn({ templateId: "two" }),
    });
    answers[1].reject(new Error("offline"));
    await opened;
    expect(deps.store.selectViewData().detail.isFailed).toBe(true);
    expect(deps.store.selectViewData().detail.useDisabled).toBe(true);

    const retry = handlers.handleDetailRetry(deps);
    answers[2].resolve(template("two"));
    await retry;
    expect(getProjectTemplate).toHaveBeenLastCalledWith({ templateId: "two" });
    expect(deps.store.selectViewData().detail.isLoaded).toBe(true);
  });

  it("uses the store template the page shows", async () => {
    const deps = createDeps({
      listProjectTemplates: async () => ({ templates: [card("one")] }),
      getProjectTemplate: async () => template("one"),
    });
    handlers.handleBeforeMount(deps);
    await settle();
    await handlers.handleTemplateGridClick(deps, {
      _event: eventOn({ templateId: "one" }),
    });

    handlers.handleUseTemplateClick(deps);

    expect(dispatched(deps)).toEqual([
      {
        type: "template-select",
        detail: {
          template: {
            id: "one",
            source: "store",
            title: "Template one",
            coverUrl: "https://files.example/one.png",
            resolution: { width: 1920, height: 1080 },
          },
        },
      },
    ]);
  });

  it("moves through screenshots with the buttons, the thumbnails and the arrow keys", async () => {
    const deps = createDeps({
      listProjectTemplates: async () => ({ templates: [card("one")] }),
      getProjectTemplate: async () => template("one"),
    });
    handlers.handleBeforeMount(deps);
    await settle();
    await handlers.handleTemplateGridClick(deps, {
      _event: eventOn({ templateId: "one" }),
    });

    handlers.handleNextScreenshotClick(deps);
    expect(deps.store.selectScreenshotIndex()).toBe(1);
    handlers.handlePreviousScreenshotClick(deps);
    handlers.handlePreviousScreenshotClick(deps);
    expect(deps.store.selectScreenshotIndex()).toBe(2);

    handlers.handleScreenshotThumbnailKeyDown(deps, {
      _event: eventOn({ screenshotIndex: "0" }, { key: " " }),
    });
    expect(deps.store.selectScreenshotIndex()).toBe(0);

    const arrow = (key, rtl) => ({
      key,
      preventDefault: vi.fn(),
      currentTarget: { matches: () => rtl },
    });
    handlers.handleScreenshotViewerKeyDown(deps, {
      _event: arrow("ArrowRight", false),
    });
    expect(deps.store.selectScreenshotIndex()).toBe(1);
    // Right-to-left layouts put the next screenshot on the left.
    handlers.handleScreenshotViewerKeyDown(deps, {
      _event: arrow("ArrowLeft", true),
    });
    expect(deps.store.selectScreenshotIndex()).toBe(2);
    const other = arrow("ArrowUp", false);
    handlers.handleScreenshotViewerKeyDown(deps, { _event: other });
    expect(other.preventDefault).not.toHaveBeenCalled();
    expect(deps.store.selectScreenshotIndex()).toBe(2);
  });

  it("asks to close from the close button and the dialog", () => {
    const deps = createDeps();

    handlers.handleDialogClose(deps);

    expect(dispatched(deps)).toEqual([{ type: "close", detail: null }]);
  });
});
