import { produce } from "immer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as sceneEditorStore from "../../src/pages/sceneEditorLexical/sceneEditorLexical.store.js";
import {
  handleCommandLineSubmit,
  handleDeleteLineShortcut,
  handleDialogueCharacterShortcut,
  handleEditorDataChanged,
  handleNewLine,
  handleSystemActionsActionDelete,
  prepareSceneEditorNavigation,
} from "../../src/pages/sceneEditorLexical/sceneEditorLexical.handlers.js";
import { createStoryCommandApi } from "../../src/deps/services/shared/commandApi/story.js";
import { scenePartitionFor } from "../../src/deps/services/shared/collab/partitions.js";
import { EN_I18N } from "../support/i18n.js";

const dialogueLine = (id, text, actions = {}) => ({
  id,
  actions: { ...actions, dialogue: { content: [{ text }] } },
});

const toLineItems = (lines) => ({
  items: Object.fromEntries(lines.map((line) => [line.id, line])),
  tree: lines.map((line) => ({ id: line.id })),
});

const createDeferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

// The scene editor on its real store, over a project kept in memory. Line
// action commands go through the real story command API, which looks their
// line up in the saved project.
const createPage = () => {
  let state = sceneEditorStore.createInitialState();
  const store = new Proxy(
    {},
    {
      get: (_target, name) => (payload) => {
        if (name.startsWith("select")) {
          return sceneEditorStore[name]({ state, i18n: EN_I18N }, payload);
        }
        let result;
        state = produce(state, (draft) => {
          result = sceneEditorStore[name]({ state: draft }, payload);
        });
        return result;
      },
    },
  );
  let repositoryState = {
    characters: {
      items: {
        "character-1": {
          id: "character-1",
          type: "character",
          name: "Character One",
          shortcut: "1",
        },
      },
      tree: [{ id: "character-1" }],
    },
    scenes: {
      items: {
        "scene-1": {
          id: "scene-1",
          type: "scene",
          name: "Scene One",
          sections: {
            items: {
              "section-1": {
                id: "section-1",
                name: "Section One",
                lines: toLineItems([
                  dialogueLine("line-1", "First", {
                    background: { resourceId: "image-1" },
                  }),
                  dialogueLine("line-2", "Second"),
                ]),
              },
            },
            tree: [{ id: "section-1" }],
          },
        },
      },
      tree: [{ id: "scene-1" }],
    },
  };
  const updateRepository = (recipe) => {
    repositoryState = produce(repositoryState, recipe);
  };
  const savedSection = () =>
    repositoryState.scenes.items["scene-1"].sections.items["section-1"];
  // Every write that reached the project, in order.
  const writes = [];

  const shared = {
    ensureCommandContext: async () => ({
      projectId: "project-1",
      state: structuredClone(repositoryState),
    }),
    submitCommandWithContext: vi.fn(async ({ payload }) => {
      const { lineId, data, replace } = payload;
      writes.push(`actions ${lineId}`);
      updateRepository((draft) => {
        const line =
          draft.scenes.items["scene-1"].sections.items["section-1"].lines.items[
            lineId
          ];
        line.actions = replace
          ? data
          : {
              ...line.actions,
              ...data,
              dialogue: { ...line.actions.dialogue, ...data.dialogue },
            };
      });
      return { valid: true };
    }),
    scenePartitionFor: (_projectId, sceneId) => scenePartitionFor(sceneId),
  };
  const storyCommandApi = createStoryCommandApi(shared);

  const deps = {
    store,
    render: vi.fn(),
    refs: {},
    i18n: EN_I18N,
    subject: { dispatch: vi.fn() },
    graphicsService: { engineSelectSectionLineChanges: () => ({}) },
    appService: {
      getPayload: () => ({}),
      setPayload: vi.fn(),
      showToast: vi.fn(),
      showAlert: vi.fn(),
      showAlertWhenIdle: vi.fn(),
      reportError: vi.fn(),
      blurActiveElement: vi.fn(),
    },
    projectService: {
      getRepositoryState: () => repositoryState,
      getDomainState: () => ({}),
      getRepositoryRevision: () => 1,
      getEnsuredProjectId: () => "project-1",
      syncSectionLinesSnapshot: vi.fn(async ({ lines }) => {
        writes.push(`lines ${lines.map((line) => line.id).join(",")}`);
        updateRepository((draft) => {
          const section =
            draft.scenes.items["scene-1"].sections.items["section-1"];
          section.lines = toLineItems(
            lines.map((line) => ({
              id: line.id,
              actions: {
                ...section.lines.items[line.id]?.actions,
                ...line.actions,
              },
            })),
          );
        });
        return { valid: true };
      }),
      updateLineActions: storyCommandApi.updateLineActions,
      updateLineDialogueAction: storyCommandApi.updateLineDialogueAction,
      cacheSceneTextStats: vi.fn(async () => {}),
    },
  };
  store.setRepositoryState({ repository: repositoryState });
  store.setSceneId({ sceneId: "scene-1" });
  store.setSelectedSectionId({ selectedSectionId: "section-1" });
  store.setSelectedLineId({ selectedLineId: "line-2" });

  const pageLineIds = () =>
    store.selectScene().sections[0].lines.map((line) => line.id);
  // The editor reporting typing in a line.
  const type = (lineId, text) =>
    handleEditorDataChanged(deps, {
      _event: {
        currentTarget: { dataset: { sectionId: "section-1" } },
        detail: {
          reason: "text",
          selectedLineId: lineId,
          lines: store.selectScene().sections[0].lines.map((line) => ({
            ...line,
            sectionId: "section-1",
            actions: {
              ...line.actions,
              dialogue:
                line.id === lineId
                  ? { ...line.actions.dialogue, content: [{ text }] }
                  : line.actions.dialogue,
            },
          })),
        },
      },
    });

  return {
    deps,
    store,
    shared,
    writes,
    savedSection,
    updateRepository,
    pageLineIds,
    type,
  };
};

describe("scene editor: a line action among the saves around it", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback) =>
      setTimeout(callback, 16),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("does not run for a line deleted while it waited for an earlier save", async () => {
    const page = createPage();
    await page.type("line-2", "Second, rewritten");

    // A save of the drafts is running, slowly, as in a large project.
    const slowSave = createDeferred();
    const saveLines = page.deps.projectService.syncSectionLinesSnapshot;
    const saveLinesNow = saveLines.getMockImplementation();
    saveLines.mockImplementationOnce(async (payload) => {
      await slowSave.promise;
      return saveLinesNow(payload);
    });
    const runningSave = prepareSceneEditorNavigation(page.deps, {
      reason: "backup",
    });

    // The character shortcut on the line, then the line deleted, while that
    // save runs.
    const shortcut = handleDialogueCharacterShortcut(page.deps, {
      _event: { detail: { lineId: "line-2", shortcut: "1" } },
    });
    await handleDeleteLineShortcut(page.deps, {
      _event: { detail: { lineId: "line-2" } },
    });
    expect(page.pageLineIds()).toEqual(["line-1"]);

    slowSave.resolve();
    await runningSave;
    await expect(shortcut).resolves.toBeUndefined();

    // The save stored the deletion, and the shortcut, for a line that is gone,
    // stored nothing.
    expect(page.writes).toEqual(["lines line-1"]);
    expect(page.shared.submitCommandWithContext).not.toHaveBeenCalled();
    expect(page.store.selectIsEditHistoryBlocked()).toBe(false);
  });

  it("does not run for a new line whose section could not be saved, which the user is told", async () => {
    const page = createPage();
    await handleNewLine(page.deps, {
      _event: { detail: { lineId: "line-2", position: "after" } },
    });
    const [, , newLineId] = page.pageLineIds();
    // The actions dialog is open for the new line.
    page.store.setActionTargetLineId({ lineId: newLineId });
    page.deps.projectService.syncSectionLinesSnapshot.mockResolvedValueOnce({
      valid: false,
      error: { message: "Storage is full" },
    });

    await expect(
      handleCommandLineSubmit(page.deps, {
        _event: { detail: { bgm: {} } },
      }),
    ).resolves.toBeUndefined();

    expect(page.pageLineIds()).toEqual(["line-1", "line-2"]);
    expect(page.shared.submitCommandWithContext).not.toHaveBeenCalled();
    expect(page.deps.appService.showAlertWhenIdle).toHaveBeenCalledOnce();
    expect(
      page.deps.appService.showAlertWhenIdle.mock.calls[0][0].message,
    ).toContain("could not be saved and were removed");
    // The action ends: undo works again and no line is waiting for actions.
    expect(page.store.selectActionTargetLineId()).toBeUndefined();
    expect(page.store.selectIsEditHistoryBlocked()).toBe(false);
  });

  it("is saved before the page leaves the project, even while it waits behind another line action", async () => {
    const page = createPage();
    page.store.setSelectedLineId({ selectedLineId: "line-1" });
    const slowWrite = createDeferred();
    const writeNow =
      page.shared.submitCommandWithContext.getMockImplementation();
    page.shared.submitCommandWithContext.mockImplementationOnce(
      async (payload) => {
        await slowWrite.promise;
        return writeNow(payload);
      },
    );

    const removeBackground = handleSystemActionsActionDelete(page.deps, {
      _event: { detail: { actionType: "background" } },
    });
    const addMusic = handleCommandLineSubmit(page.deps, {
      _event: { detail: { bgm: {} } },
    });
    let hasLeft = false;
    const leaving = prepareSceneEditorNavigation(page.deps, {
      path: "/projects",
    }).then(() => {
      hasLeft = true;
    });
    await vi.advanceTimersByTimeAsync(50);

    expect(hasLeft).toBe(false);
    expect(page.store.selectIsEditHistoryBlocked()).toBe(true);

    slowWrite.resolve();
    await leaving;
    await Promise.all([removeBackground, addMusic]);
    expect(page.writes).toEqual(["actions line-1", "actions line-1"]);
    expect(page.savedSection().lines.items["line-1"].actions).toEqual({
      background: {},
      bgm: {},
      dialogue: { content: [{ text: "First" }] },
    });
  });

  it("lets go of the actions dialog's line when its save is refused, so that undo still works", async () => {
    const page = createPage();
    // A real edit, so that undo has something to undo.
    await page.type("line-1", "First, rewritten");
    page.shared.submitCommandWithContext.mockResolvedValueOnce({
      valid: false,
      error: { code: "invalid", message: "Section not found." },
    });
    page.store.setSelectedLineId({ selectedLineId: "line-1" });
    page.store.setActionTargetLineId({ lineId: "line-1" });
    expect(page.store.selectIsEditHistoryBlocked()).toBe(true);

    await expect(
      handleCommandLineSubmit(page.deps, {
        _event: { detail: { sectionTransition: { sectionId: "section-9" } } },
      }),
    ).resolves.toBeUndefined();

    expect(page.deps.appService.showAlert).toHaveBeenCalledOnce();
    expect(page.store.selectActionTargetLineId()).toBeUndefined();
    expect(page.store.selectIsEditHistoryBlocked()).toBe(false);
  });

  it("still fails, so that it is reported, for a line the page shows and the project does not have", async () => {
    const page = createPage();
    // The page shows line-2, but the saved project has lost it by some path
    // that is not known. The command must not hide that.
    page.updateRepository((draft) => {
      const lines =
        draft.scenes.items["scene-1"].sections.items["section-1"].lines;
      delete lines.items["line-2"];
      lines.tree = lines.tree.filter((node) => node.id !== "line-2");
    });
    page.store.setActionTargetLineId({ lineId: "line-2" });
    expect(page.pageLineIds()).toContain("line-2");

    await expect(
      handleCommandLineSubmit(page.deps, {
        _event: { detail: { bgm: {} } },
      }),
    ).rejects.toThrow("Could not resolve scene partition for line command");

    expect(page.shared.submitCommandWithContext).not.toHaveBeenCalled();
    // The page is not left waiting: the dialog's line is let go, so undo works.
    expect(page.store.selectActionTargetLineId()).toBeUndefined();
    expect(page.store.selectIsEditHistoryBlocked()).toBe(false);
  });
});

describe("scene editor: one navigation action per line", () => {
  const sectionTransition = { sceneId: "scene-1", sectionId: "section-2" };
  const resetStoryAtSection = { sectionId: "section-3" };
  const updateVariable = {
    id: "update-1",
    operations: [{ variableId: "variable-1", op: "set", value: 1 }],
  };
  const conditionalWith = (branchActions) => ({
    branches: [
      {
        when: { eq: [{ var: "variables.variable-1" }, 1] },
        actions: branchActions,
      },
      { actions: {} },
    ],
  });
  const lineOneActions = {
    background: { resourceId: "image-1" },
    dialogue: { content: [{ text: "First" }] },
  };

  // Submitting from the actions dialog of the selected line.
  const submit = (page, detail) =>
    handleCommandLineSubmit(page.deps, { _event: { detail } });
  const savedLineOne = (page) =>
    page.savedSection().lines.items["line-1"].actions;
  const shownLineOne = (page) =>
    page.store.selectScene().sections[0].lines[0].actions;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback) =>
      setTimeout(callback, 16),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("replaces the line's section transition with a reset story at section", async () => {
    const page = createPage();
    page.store.setSelectedLineId({ selectedLineId: "line-1" });
    await submit(page, { sectionTransition });

    await submit(page, { resetStoryAtSection });

    const expectedActions = { ...lineOneActions, resetStoryAtSection };
    expect(savedLineOne(page)).toEqual(expectedActions);
    expect(shownLineOne(page)).toEqual(expectedActions);
    // Each submit is one save, so one undo step.
    expect(page.writes).toEqual(["actions line-1", "actions line-1"]);
  });

  it("replaces the line's reset story at section with a section transition", async () => {
    const page = createPage();
    page.store.setSelectedLineId({ selectedLineId: "line-1" });
    await submit(page, { resetStoryAtSection });

    await submit(page, { sectionTransition });

    expect(savedLineOne(page)).toEqual({
      ...lineOneActions,
      sectionTransition,
    });
  });

  it("takes the navigation out of the line's conditional when a section transition is added", async () => {
    const page = createPage();
    page.store.setSelectedLineId({ selectedLineId: "line-1" });
    await submit(page, {
      conditional: conditionalWith({ resetStoryAtSection, updateVariable }),
    });

    await submit(page, { sectionTransition });

    expect(savedLineOne(page)).toEqual({
      ...lineOneActions,
      conditional: conditionalWith({ updateVariable }),
      sectionTransition,
    });
  });

  it("removes the line's section transition when a conditional that navigates is saved", async () => {
    const page = createPage();
    page.store.setSelectedLineId({ selectedLineId: "line-1" });
    await submit(page, { sectionTransition });

    await submit(page, {
      conditional: conditionalWith({ resetStoryAtSection }),
    });

    expect(savedLineOne(page)).toEqual({
      ...lineOneActions,
      conditional: conditionalWith({ resetStoryAtSection }),
    });
  });

  it.each([
    ["a section transition", { resetStoryAtSection }, { sectionTransition }],
    [
      "a reset story at section",
      { sectionTransition },
      { resetStoryAtSection },
    ],
  ])(
    "keeps a dialogue change submitted with %s that replaces the line's navigation",
    async (_name, savedNavigation, submittedNavigation) => {
      const page = createPage();
      page.store.setSelectedLineId({ selectedLineId: "line-1" });
      page.updateRepository((draft) => {
        const { actions } =
          draft.scenes.items["scene-1"].sections.items["section-1"].lines.items[
            "line-1"
          ];
        actions.dialogue.characterId = "character-1";
        Object.assign(actions, savedNavigation);
      });
      page.store.setRepositoryState({
        repository: page.deps.projectService.getRepositoryState(),
      });

      await submit(page, {
        dialogue: { characterId: "character-2" },
        ...submittedNavigation,
      });

      expect(savedLineOne(page)).toEqual({
        background: { resourceId: "image-1" },
        dialogue: {
          characterId: "character-2",
          content: [{ text: "First" }],
        },
        ...submittedNavigation,
      });
    },
  );

  it("merges other actions, and leaves a line that already has two navigation actions alone", async () => {
    const page = createPage();
    page.store.setSelectedLineId({ selectedLineId: "line-1" });
    page.updateRepository((draft) => {
      const { actions } =
        draft.scenes.items["scene-1"].sections.items["section-1"].lines.items[
          "line-1"
        ];
      actions.sectionTransition = sectionTransition;
      actions.resetStoryAtSection = resetStoryAtSection;
    });
    page.store.setRepositoryState({
      repository: page.deps.projectService.getRepositoryState(),
    });
    expect(shownLineOne(page)).toMatchObject({
      sectionTransition,
      resetStoryAtSection,
    });

    await submit(page, { bgm: {} });

    expect(page.shared.submitCommandWithContext).toHaveBeenCalledOnce();
    expect(
      page.shared.submitCommandWithContext.mock.calls[0][0].payload.replace,
    ).toBeUndefined();
    expect(savedLineOne(page)).toEqual({
      ...lineOneActions,
      sectionTransition,
      resetStoryAtSection,
      bgm: {},
    });
  });
});
