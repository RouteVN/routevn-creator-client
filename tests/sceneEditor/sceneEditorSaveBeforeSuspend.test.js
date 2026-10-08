import { describe, expect, it, vi } from "vitest";
import * as storeModule from "../../src/pages/sceneEditorLexical/sceneEditorLexical.store.js";
import {
  handleSystemActionsActionDelete,
  prepareSceneEditorNavigation,
} from "../../src/pages/sceneEditorLexical/sceneEditorLexical.handlers.js";
import {
  createSceneEditorDraftSection,
  replaceSceneEditorDraftSectionLines,
} from "../../src/internal/ui/sceneEditorLexical/draftSection.js";
import Subject from "../../src/deps/subject.js";
import { createAppServiceCore } from "../../src/deps/services/shared/appServiceCore.js";
import { createMobileAudioRuntime } from "../../src/deps/clients/mobileAudioRuntime.js";
import { saveWhenAppGoesInactive } from "../../src/deps/clients/mobileLifecycle.js";
import { EN_I18N } from "../support/i18n.js";

const line = (id, text) => ({
  id,
  actions: { dialogue: { content: [{ text }] } },
});

const savedLines = [line("a", "saved one"), line("b", "saved two")];
const typedLines = [...savedLines, line("new-1", "typed just now")];

const createRepositoryState = () => ({
  scenes: {
    items: {
      "scene-1": {
        id: "scene-1",
        type: "scene",
        name: "Scene 1",
        sections: {
          items: {
            "section-1": {
              id: "section-1",
              name: "Section 1",
              lines: {
                items: Object.fromEntries(
                  savedLines.map((item) => [item.id, structuredClone(item)]),
                ),
                tree: savedLines.map(({ id }) => ({ id })),
              },
            },
          },
          tree: [{ id: "section-1" }],
        },
      },
    },
    tree: [{ id: "scene-1" }],
  },
});

const bindStore = (state) =>
  Object.fromEntries(
    Object.entries(storeModule)
      .filter(([, value]) => typeof value === "function")
      .map(([name, fn]) => [name, (payload) => fn({ state }, payload)]),
  );

// A scene editor with a section holding lines typed a moment ago, which the
// autosave has not saved yet.
const createPage = () => {
  const state = storeModule.createInitialState();
  const store = bindStore(state);
  const repositoryState = createRepositoryState();
  store.setSceneId({ sceneId: "scene-1" });
  store.setRepositoryState({ repository: repositoryState });
  store.setRepositoryRevision({ revision: 5 });
  store.setSelectedSectionId({ selectedSectionId: "section-1" });
  store.setDraftSection({
    draftSection: replaceSceneEditorDraftSectionLines(
      createSceneEditorDraftSection({
        sceneId: "scene-1",
        sectionId: "section-1",
        section: { lines: savedLines },
        revision: 5,
      }),
      { lines: typedLines, source: "text", dirty: true },
    ),
  });
  const editor = {
    dataset: { sectionId: "section-1" },
    focusLine: vi.fn(),
    getLines: vi.fn(() => structuredClone(typedLines)),
    replaceLines: vi.fn(),
  };
  const projectService = {
    syncSectionLinesSnapshot: vi.fn(async () => ({ valid: true })),
    getRepositoryState: () => repositoryState,
    getDomainState: () => ({}),
    getRepositoryRevision: () => 5,
    cacheSceneTextStats: vi.fn(async () => {}),
    getEnsuredProjectId: () => "project-1",
  };
  const deps = {
    store,
    i18n: EN_I18N,
    refs: { sectionEditor0: editor },
    render: vi.fn(),
    subject: { dispatch: vi.fn() },
    graphicsService: { engineSelectSectionLineChanges: () => ({}) },
    appService: {
      showAlert: vi.fn(),
      showAlertWhenIdle: vi.fn(),
      reportError: vi.fn(),
    },
    projectService,
  };
  return { deps, store, projectService };
};

describe("scene editor: saving as the app goes to the background or quits", () => {
  it.each(["background", "quit", "backup"])(
    "saves the unsaved lines for the %s reason",
    async (reason) => {
      const { deps, store, projectService } = createPage();

      await prepareSceneEditorNavigation(deps, { reason });

      expect(projectService.syncSectionLinesSnapshot).toHaveBeenCalledTimes(1);
      expect(projectService.syncSectionLinesSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ sectionId: "section-1", lines: typedLines }),
      );
      expect(store.selectPendingDraftSections()).toEqual([]);
    },
  );

  it("saves, and rewrites, nothing when nothing is unsaved", async () => {
    const { deps, store, projectService } = createPage();
    store.setDraftSection({
      draftSection: {
        ...store.selectDraftSection(),
        dirty: false,
      },
    });

    await prepareSceneEditorNavigation(deps, { reason: "background" });

    expect(projectService.syncSectionLinesSnapshot).not.toHaveBeenCalled();
    // An unchanged page must not make the project look changed, as for a
    // backup check.
    expect(projectService.cacheSceneTextStats).not.toHaveBeenCalled();
  });

  it("saves the typed lines when the app goes inactive, from the activity signal to the store", async () => {
    const { deps, projectService } = createPage();
    const documentTarget = Object.assign(new EventTarget(), { hidden: false });
    const windowTarget = {
      performance: { now: () => Date.now() },
      setTimeout,
      clearTimeout,
      queueMicrotask,
    };
    const runtime = createMobileAudioRuntime({ windowTarget, documentTarget });
    const appService = createAppServiceCore({
      db: { get: async () => undefined, set: async () => {} },
      subject: new Subject(),
      projectService: { getEnsuredProjectId: () => undefined },
      router: {
        getPathName: () => "/project/scene-editor",
        getPayload: () => ({}),
      },
      globalUI: { showToast: vi.fn() },
      platform: "android",
    });
    // The page registers its save as it mounts.
    appService.registerBeforeNavigation((payload) =>
      prepareSceneEditorNavigation(deps, payload),
    );
    saveWhenAppGoesInactive({ runtime, appService });
    expect(projectService.syncSectionLinesSnapshot).not.toHaveBeenCalled();

    // Android's activity pauses and tells the page.
    windowTarget.routeVNSetAppActive(false);

    await vi.waitFor(() =>
      expect(projectService.syncSectionLinesSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ lines: typedLines }),
      ),
    );
  });

  it.each(["quit", "background"])(
    "for %s, also saves lines typed while the first save was writing",
    async (reason) => {
      const { deps, store, projectService } = createPage();
      const typedDuringSave = [
        ...typedLines,
        line("new-2", "typed during save"),
      ];
      projectService.syncSectionLinesSnapshot.mockImplementationOnce(
        async () => {
          // The user keeps typing while this save is written.
          deps.refs.sectionEditor0.getLines.mockReturnValue(
            structuredClone(typedDuringSave),
          );
          store.setDraftSection({
            draftSection: {
              ...store.selectDraftSection(),
              lines: structuredClone(typedDuringSave),
              dirty: true,
            },
          });
          return { valid: true };
        },
      );

      await prepareSceneEditorNavigation(deps, { reason });

      expect(projectService.syncSectionLinesSnapshot).toHaveBeenCalledTimes(2);
      expect(
        projectService.syncSectionLinesSnapshot.mock.calls[1][0].lines,
      ).toEqual(typedDuringSave);
      expect(store.selectPendingDraftSections()).toEqual([]);
    },
  );

  it("for a backup, leaves lines typed during the save to the next autosave", async () => {
    vi.useFakeTimers();
    try {
      const { deps, store, projectService } = createPage();
      projectService.syncSectionLinesSnapshot.mockImplementationOnce(
        async () => {
          store.setDraftSection({
            draftSection: {
              ...store.selectDraftSection(),
              lines: [...typedLines, line("new-2", "typed during save")],
              dirty: true,
            },
          });
          return { valid: true };
        },
      );

      await prepareSceneEditorNavigation(deps, { reason: "backup" });

      expect(projectService.syncSectionLinesSnapshot).toHaveBeenCalledTimes(1);
      expect(store.selectPendingDraftSections()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["quit", "background"])(
    "for %s, waits for a line action that is still being written",
    async (reason) => {
      const { deps, store, projectService } = createPage();
      // Nothing typed is unsaved; only the line action is being written.
      store.setDraftSection({
        draftSection: { ...store.selectDraftSection(), dirty: false },
      });
      store.setSelectedLineId({ selectedLineId: "a" });
      const order = [];
      let finishActionWrite;
      projectService.updateLineActions = vi.fn(
        () =>
          new Promise((resolve) => {
            finishActionWrite = () => {
              order.push("line action written");
              resolve({ valid: true });
            };
          }),
      );

      const deleting = handleSystemActionsActionDelete(deps, {
        _event: { detail: { actionType: "background" } },
      });
      await vi.waitFor(() =>
        expect(projectService.updateLineActions).toHaveBeenCalledOnce(),
      );
      const suspending = prepareSceneEditorNavigation(deps, { reason }).then(
        () => order.push("saved before suspending"),
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(order).toEqual([]);

      finishActionWrite();
      await suspending;
      await deleting;

      expect(order).toEqual(["line action written", "saved before suspending"]);
    },
  );
});
