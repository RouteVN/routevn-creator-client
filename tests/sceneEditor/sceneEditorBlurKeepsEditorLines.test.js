import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as storeModule from "../../src/pages/sceneEditorLexical/sceneEditorLexical.store.js";
import {
  handleEditorBlur,
  handlePreviewClick,
  prepareSceneEditorNavigation,
} from "../../src/pages/sceneEditorLexical/sceneEditorLexical.handlers.js";
import { EN_I18N } from "../support/i18n.js";

const line = (id, text) => ({
  id,
  actions: { dialogue: { content: [{ text }] } },
});

const texts = (lines) =>
  lines.map((item) =>
    item.actions.dialogue.content.map((part) => part.text).join(""),
  );

const toSection = (id, lines) => ({
  id,
  name: id,
  lines: {
    items: Object.fromEntries(
      lines.map((item) => [item.id, structuredClone(item)]),
    ),
    tree: lines.map(({ id: lineId }) => ({ id: lineId })),
  },
});

const savedLines = {
  "section-1": [line("a", "first line"), line("b", "second line")],
  "section-2": [line("c", "other section")],
};

const createRepositoryState = () => ({
  scenes: {
    items: {
      "scene-1": {
        id: "scene-1",
        type: "scene",
        name: "Scene One",
        sections: {
          items: {
            "section-1": toSection("section-1", savedLines["section-1"]),
            "section-2": toSection("section-2", savedLines["section-2"]),
          },
          tree: [{ id: "section-1" }, { id: "section-2" }],
        },
      },
      "scene-2": {
        id: "scene-2",
        type: "scene",
        name: "Scene Two",
        sections: {
          items: {
            "section-3": toSection("section-3", [line("d", "scene two line")]),
          },
          tree: [{ id: "section-3" }],
        },
      },
    },
    tree: [{ id: "scene-1" }, { id: "scene-2" }],
  },
});

// The real store, with its state bound, as the page's components see it.
const bindStore = (state) =>
  Object.fromEntries(
    Object.entries(storeModule)
      .filter(([, value]) => typeof value === "function")
      .map(([name, fn]) => [
        name,
        (payload) => fn({ state, i18n: EN_I18N }, payload),
      ]),
  );

// An editor that, like the real one without focus, shows whatever lines a
// render gives it, and keeps text it never reported until then.
const createEditor = (sectionId, lines) => {
  let current = structuredClone(lines);
  return {
    dataset: { sectionId },
    focusLine: vi.fn(),
    getLines: vi.fn(() => structuredClone(current)),
    showRenderedLines: (next) => {
      current = structuredClone(next);
    },
  };
};

const blurPayload = (sectionId) => ({
  _event: { currentTarget: { dataset: { sectionId } } },
});

describe("scene editor: text that reaches the editor after it lost focus", () => {
  let store;
  let editors;
  let deps;
  let syncSectionLinesSnapshot;

  beforeEach(() => {
    vi.useFakeTimers();
    const state = storeModule.createInitialState();
    store = bindStore(state);
    store.setSceneId({ sceneId: "scene-1" });
    store.setRepositoryState({ repository: createRepositoryState() });
    store.setRepositoryRevision({ revision: 5 });
    store.setSelectedSectionId({ selectedSectionId: "section-1" });
    store.setSelectedLineId({ selectedLineId: "b" });
    editors = {
      first: createEditor("section-1", savedLines["section-1"]),
      second: createEditor("section-2", savedLines["section-2"]),
    };
    const repositoryState = createRepositoryState();
    let revision = 5;
    // Like the real save, a stored snapshot becomes the section's lines.
    syncSectionLinesSnapshot = vi.fn(async ({ sectionId, lines }) => {
      const scene = Object.values(repositoryState.scenes.items).find(
        (item) => item.sections.items[sectionId],
      );
      scene.sections.items[sectionId] = toSection(sectionId, lines);
      revision += 1;
      return { valid: true };
    });
    deps = {
      store,
      i18n: EN_I18N,
      refs: { sectionEditor0: editors.first, sectionEditor1: editors.second },
      // Like the page view, a render loads each section's lines into its
      // editor.
      render: vi.fn(() => {
        for (const editor of Object.values(editors)) {
          const section = store
            .selectScene()
            .sections.find((item) => item.id === editor.dataset.sectionId);
          // An editor of a section no longer on screen is about to go.
          if (section) {
            editor.showRenderedLines(section.lines);
          }
        }
      }),
      subject: { dispatch: vi.fn() },
      appService: {
        showAlert: vi.fn(),
        showAlertWhenIdle: vi.fn(),
        reportError: vi.fn(),
        blurActiveElement: vi.fn(),
      },
      projectService: {
        syncSectionLinesSnapshot,
        getRepositoryState: () => repositoryState,
        getDomainState: () => ({}),
        getRepositoryRevision: () => revision,
        cacheSceneTextStats: vi.fn(async () => {}),
        getEnsuredProjectId: () => "project-1",
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the text through the render after the blur, and saves it", async () => {
    // A keyboard finished a word after the editor lost focus, so the editor
    // holds it but never reported it.
    editors.first.showRenderedLines([
      line("a", "first line"),
      line("b", "second line and a late word"),
    ]);

    handleEditorBlur(deps, blurPayload("section-1"));
    await vi.advanceTimersByTimeAsync(0);

    expect(deps.render).toHaveBeenCalledTimes(1);
    expect(texts(editors.first.getLines())).toEqual([
      "first line",
      "second line and a late word",
    ]);
    const draftSection = store.selectDraftSectionBySectionId({
      sectionId: "section-1",
    });
    expect(draftSection.dirty).toBe(true);
    expect(texts(draftSection.lines)).toEqual([
      "first line",
      "second line and a late word",
    ]);
    expect(store.selectDraftSaveTimerId()).toBeDefined();

    await prepareSceneEditorNavigation(deps, { path: "/project/images" });

    expect(syncSectionLinesSnapshot).toHaveBeenCalledTimes(1);
    expect(syncSectionLinesSnapshot.mock.calls[0][0].sectionId).toBe(
      "section-1",
    );
    expect(texts(syncSectionLinesSnapshot.mock.calls[0][0].lines)).toEqual([
      "first line",
      "second line and a late word",
    ]);
  });

  it("takes the lines of the section whose editor lost focus, not the selected one", async () => {
    editors.second.showRenderedLines([line("c", "other section, late")]);

    handleEditorBlur(deps, blurPayload("section-2"));
    await vi.advanceTimersByTimeAsync(0);

    expect(texts(editors.second.getLines())).toEqual(["other section, late"]);
    expect(
      texts(
        store.selectDraftSectionBySectionId({ sectionId: "section-2" }).lines,
      ),
    ).toEqual(["other section, late"]);
    expect(
      store.selectDraftSectionBySectionId({ sectionId: "section-1" })?.dirty,
    ).not.toBe(true);
    expect(texts(editors.first.getLines())).toEqual([
      "first line",
      "second line",
    ]);
  });

  it("saves a change that reached the editor after preview saved and blurred it", async () => {
    store.setSkipNextEditorBlurDraftFlush({ value: true });
    editors.first.showRenderedLines([
      line("a", "first line"),
      line("b", "second line, after preview saved"),
    ]);

    handleEditorBlur(deps, blurPayload("section-1"));
    await vi.advanceTimersByTimeAsync(0);

    expect(texts(editors.first.getLines())).toEqual([
      "first line",
      "second line, after preview saved",
    ]);
    expect(store.selectDraftSaveTimerId()).toBeDefined();

    // The autosave stores it without waiting for another action.
    await vi.advanceTimersByTimeAsync(15000);

    expect(syncSectionLinesSnapshot).toHaveBeenCalledTimes(1);
    expect(texts(syncSectionLinesSnapshot.mock.calls[0][0].lines)).toEqual([
      "first line",
      "second line, after preview saved",
    ]);
  });

  it("saves a change that lands after preview's render, through the real preview click", async () => {
    // Like the editor, report the blur at once and finish the change just
    // after, once the code that blurred it has run.
    editors.first.blurEditor = vi.fn(() => {
      handleEditorBlur(deps, blurPayload("section-1"));
      queueMicrotask(() =>
        editors.first.showRenderedLines([
          line("a", "first line"),
          line("b", "second line, finished at preview"),
        ]),
      );
    });

    handlePreviewClick(deps, {});
    await vi.waitFor(() =>
      expect(store.selectViewData().previewVisible).toBe(true),
    );
    await vi.advanceTimersByTimeAsync(15000);

    expect(texts(editors.first.getLines())).toEqual([
      "first line",
      "second line, finished at preview",
    ]);
    expect(syncSectionLinesSnapshot).toHaveBeenCalledTimes(1);
    expect(texts(syncSectionLinesSnapshot.mock.calls[0][0].lines)).toEqual([
      "first line",
      "second line, finished at preview",
    ]);
  });

  it("ignores the previous scene's editor when the scene changed before the blur was handled", async () => {
    handleEditorBlur(deps, blurPayload("section-1"));
    store.setSceneId({ sceneId: "scene-2" });
    await vi.advanceTimersByTimeAsync(0);

    expect(
      store.selectDraftSectionBySectionId({ sectionId: "section-1" }),
    ).toBeUndefined();
    expect(store.selectPendingDraftSections()).toEqual([]);
    expect(store.selectEditHistoryStep({ direction: "undo" })).toBeUndefined();
  });

  it("changes nothing when the editor holds only what the page has", async () => {
    handleEditorBlur(deps, blurPayload("section-1"));
    await vi.advanceTimersByTimeAsync(0);

    expect(store.selectPendingDraftSections()).toEqual([]);

    await prepareSceneEditorNavigation(deps, { path: "/project/images" });

    expect(syncSectionLinesSnapshot).not.toHaveBeenCalled();
  });
});
