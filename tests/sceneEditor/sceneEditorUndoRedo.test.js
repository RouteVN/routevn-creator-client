import { produce } from "immer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as sceneEditorStore from "../../src/pages/sceneEditorLexical/sceneEditorLexical.store.js";
import {
  handleEditHistoryShortcutKeyDown,
  handleEditorCompositionStateChanged,
  handleEditorDataChanged,
  handleMobileKeyboardToolbarActionClick,
  handleNewLine,
  handleRedoButtonClick,
  handleSystemActionsActionDelete,
  handleUndoButtonClick,
} from "../../src/pages/sceneEditorLexical/sceneEditorLexical.handlers.js";
import { EN_I18N } from "../support/i18n.js";

const dialogueLine = (id, text, actions = {}) => ({
  id,
  actions: { ...actions, dialogue: { content: [{ text }] } },
});

const toLineItems = (lines) => ({
  items: Object.fromEntries(lines.map((line) => [line.id, line])),
  tree: lines.map((line) => ({ id: line.id })),
});

// The scene editor on its real store, with one scene of two sections and an
// editor element per section.
const createPage = ({ secondLine = dialogueLine("line-2", "Second") } = {}) => {
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
                  dialogueLine("line-1", "Hello world", {
                    background: { resourceId: "bg-1" },
                  }),
                  secondLine,
                ]),
              },
              "section-2": {
                id: "section-2",
                name: "Section Two",
                lines: toLineItems([dialogueLine("line-3", "Third")]),
              },
            },
            tree: [{ id: "section-1" }, { id: "section-2" }],
          },
        },
      },
      tree: [{ id: "scene-1" }],
    },
  };
  // Changes the saved project; the store freezes what it is given.
  const updateRepository = (recipe) => {
    repositoryState = produce(repositoryState, recipe);
  };
  // Saves a section's lines as the draft flush does: whole lines for new and
  // marked lines, only the dialogue for the others.
  const saveSectionLines = (sectionId, lines, actionLineIds) =>
    updateRepository((draft) => {
      const section = draft.scenes.items["scene-1"].sections.items[sectionId];
      const items = {};
      for (const line of lines) {
        const saved = section.lines.items[line.id];
        items[line.id] =
          saved && !actionLineIds.includes(line.id)
            ? {
                id: line.id,
                actions: { ...saved.actions, dialogue: line.actions.dialogue },
              }
            : { id: line.id, actions: line.actions };
      }
      section.lines = toLineItems(Object.values(items));
    });
  // Writes a line's actions, as the line action commands do.
  const writeLineActions = (lineId, actions) =>
    updateRepository((draft) => {
      for (const section of Object.values(
        draft.scenes.items["scene-1"].sections.items,
      )) {
        if (section.lines.items[lineId]) {
          section.lines.items[lineId] = { id: lineId, actions };
        }
      }
    });
  const editors = ["section-1", "section-2"].map((sectionId) => ({
    dataset: { sectionId },
    getLines: () => [],
    focusLine: vi.fn(),
    focusContainer: vi.fn(),
    scrollLineIntoView: vi.fn(),
    replaceLines: vi.fn(),
  }));
  const deps = {
    store,
    render: vi.fn(),
    refs: { sectionEditor0: editors[0], sectionEditor1: editors[1] },
    i18n: EN_I18N,
    subject: { dispatch: vi.fn() },
    graphicsService: { engineSelectSectionLineChanges: () => ({}) },
    appService: {
      getPayload: () => ({}),
      setPayload: vi.fn(),
      showToast: vi.fn(),
      showAlert: vi.fn(),
    },
    projectService: {
      getRepositoryState: () => repositoryState,
      getDomainState: () => ({}),
      getRepositoryRevision: () => 1,
      syncSectionLinesSnapshot: vi.fn(
        async ({ sectionId, lines, actionLineIds = [] }) => {
          saveSectionLines(sectionId, lines, actionLineIds);
          return { valid: true };
        },
      ),
      updateLineActions: vi.fn(async ({ lineId, data }) => {
        writeLineActions(lineId, data);
        return { valid: true };
      }),
      cacheSceneTextStats: vi.fn(async () => {}),
    },
  };
  store.setRepositoryState({ repository: repositoryState });
  store.setSceneId({ sceneId: "scene-1" });
  store.setSelectedSectionId({ selectedSectionId: "section-1" });
  store.setSelectedLineId({ selectedLineId: "line-1" });

  const pageLines = (sectionId = "section-1") =>
    store
      .selectScene()
      .sections.find((section) => section.id === sectionId)
      .lines.map((line) => ({
        id: line.id,
        text: (line.actions.dialogue?.content ?? [])
          .map((item) => item.text)
          .join(""),
      }));
  const editorLines = (sectionId = "section-1") =>
    store
      .selectScene()
      .sections.find((section) => section.id === sectionId)
      .lines.map((line) => ({ ...line, sectionId }));
  // The editor reporting its lines after typing. Like the editor, it gives
  // every line a dialogue.
  const type = (lineId, text, sectionId = "section-1") =>
    handleEditorDataChanged(deps, {
      _event: {
        currentTarget: { dataset: { sectionId } },
        detail: {
          reason: "text",
          selectedLineId: lineId,
          lines: editorLines(sectionId).map((line) => ({
            ...line,
            actions: {
              ...line.actions,
              dialogue: {
                ...line.actions.dialogue,
                content:
                  line.id === lineId
                    ? text
                      ? [{ text }]
                      : []
                    : (line.actions.dialogue?.content ?? []),
              },
            },
          })),
        },
      },
    });
  const view = () => sceneEditorStore.selectViewData({ state, i18n: EN_I18N });
  const savedLine = (lineId) =>
    Object.values(
      deps.projectService.getRepositoryState().scenes.items["scene-1"].sections
        .items,
    ).find((section) => section.lines.items[lineId]).lines.items[lineId];
  return {
    deps,
    store,
    editors,
    pageLines,
    type,
    view,
    updateRepository,
    savedLine,
  };
};

const shortcut = (path, init) => ({
  metaKey: true,
  key: "z",
  code: "KeyZ",
  composedPath: () => path,
  preventDefault: vi.fn(),
  ...init,
});

describe("scene editor undo and redo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback) =>
      setTimeout(callback, 16),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("undoes a burst of typing in one step, at once, and saves it with the draft", async () => {
    const page = createPage();
    expect(page.view()).toMatchObject({
      undoDisabled: true,
      redoDisabled: true,
      undoLabel: "Undo",
    });
    for (const text of ["Hello big world", "Hello bigger world"]) {
      await page.type("line-1", text);
      vi.advanceTimersByTime(200);
    }
    vi.advanceTimersByTime(2000);
    await page.type("line-2", "Second line");

    handleUndoButtonClick(page.deps);
    expect(page.pageLines()[1].text).toBe("Second");
    handleUndoButtonClick(page.deps);

    expect(page.pageLines()).toEqual([
      { id: "line-1", text: "Hello world" },
      { id: "line-2", text: "Second" },
    ]);
    expect(page.view()).toMatchObject({
      undoDisabled: true,
      redoDisabled: false,
    });
    // The editor gets the restored lines directly, with the caret where the
    // text changed.
    expect(page.editors[0].replaceLines).toHaveBeenLastCalledWith({
      lines: expect.any(Array),
      lineId: "line-1",
      cursorPosition: 6,
    });
    expect(page.editors[1].replaceLines).not.toHaveBeenCalled();

    page.deps.projectService.syncSectionLinesSnapshot.mockClear();
    await vi.advanceTimersByTimeAsync(5000);
    const [{ lines, actionLineIds }] =
      page.deps.projectService.syncSectionLinesSnapshot.mock.calls.at(-1);
    expect(lines[0].actions.dialogue.content).toEqual([
      { text: "Hello world" },
    ]);
    expect(actionLineIds.toSorted()).toEqual(["line-1", "line-2"]);

    handleRedoButtonClick(page.deps);
    expect(page.pageLines()[0].text).toBe("Hello bigger world");
  });

  it("undoes typing into an empty line, from its first letter, in one step", async () => {
    const page = createPage();
    await page.type("line-2", "");
    vi.advanceTimersByTime(2000);
    for (const text of ["H", "Hi", "Hi there"]) {
      await page.type("line-2", text);
      vi.advanceTimersByTime(100);
    }

    handleUndoButtonClick(page.deps);

    expect(page.pageLines()[1].text).toBe("");
  });

  it("undoes a new line and selects the line before it", async () => {
    const page = createPage();
    await handleNewLine(page.deps, {
      _event: {
        currentTarget: { dataset: { sectionId: "section-1" } },
        detail: { lineId: "line-1", position: "after" },
      },
    });
    expect(page.pageLines()).toHaveLength(3);

    handleUndoButtonClick(page.deps);

    expect(page.pageLines().map((line) => line.id)).toEqual([
      "line-1",
      "line-2",
    ]);
    expect(page.store.selectSelectedLineId()).toBe("line-1");
  });

  it("records a composition once it ends", async () => {
    const page = createPage();
    const compose = (isComposing) =>
      handleEditorCompositionStateChanged(page.deps, {
        _event: {
          currentTarget: { dataset: { sectionId: "section-1" } },
          detail: { isComposing },
        },
      });
    compose(true);
    await page.type("line-2", "Secondk");
    vi.advanceTimersByTime(1500);
    await page.type("line-2", "Secondか");
    expect(page.view().undoDisabled).toBe(true);
    // Undo waits while text is being composed.
    handleUndoButtonClick(page.deps);
    expect(page.pageLines()[1].text).toBe("Secondか");

    compose(false);
    handleUndoButtonClick(page.deps);

    expect(page.pageLines()[1].text).toBe("Second");
  });

  it("undoes a line action edit at once and saves the line's whole actions", async () => {
    const page = createPage();
    await handleSystemActionsActionDelete(page.deps, {
      _event: { detail: { actionType: "background" } },
    });
    const line = () => page.store.selectScene().sections[0].lines[0];
    expect(line().actions.background).toEqual({});

    handleUndoButtonClick(page.deps);

    // The page shows the background before anything is saved.
    expect(line().actions.background).toEqual({ resourceId: "bg-1" });
    await vi.advanceTimersByTimeAsync(5000);
    expect(
      page.deps.projectService.syncSectionLinesSnapshot,
    ).toHaveBeenLastCalledWith({
      sectionId: "section-1",
      lines: expect.arrayContaining([
        expect.objectContaining({
          id: "line-1",
          actions: expect.objectContaining({
            background: { resourceId: "bg-1" },
          }),
        }),
      ]),
      actionLineIds: ["line-1"],
    });
  });

  it("saves pending text before a line action edit, so the edit is its own step", async () => {
    const page = createPage();
    await page.type("line-1", "Hello there");
    await handleSystemActionsActionDelete(page.deps, {
      _event: { detail: { actionType: "background" } },
    });
    expect(
      page.deps.projectService.syncSectionLinesSnapshot,
    ).toHaveBeenCalled();

    handleUndoButtonClick(page.deps);
    const line = () => page.store.selectScene().sections[0].lines[0];
    expect(line().actions.background).toEqual({ resourceId: "bg-1" });
    expect(page.pageLines()[0].text).toBe("Hello there");

    handleUndoButtonClick(page.deps);
    expect(page.pageLines()[0].text).toBe("Hello world");
  });

  it("keeps a burst of typing one step when another line has no dialogue", async () => {
    const page = createPage({
      secondLine: {
        id: "line-2",
        actions: { background: { resourceId: "b" } },
      },
    });
    for (const text of ["Hello world!", "Hello world!!", "Hello world!!!"]) {
      await page.type("line-1", text);
      vi.advanceTimersByTime(100);
    }

    handleUndoButtonClick(page.deps);

    expect(page.pageLines()[0].text).toBe("Hello world");
  });

  it("acts on the line it was started for when the selection moves while drafts save", async () => {
    const page = createPage();
    await page.type("line-1", "Hello there");
    const sync = page.deps.projectService.syncSectionLinesSnapshot;
    const save = sync.getMockImplementation();
    sync.mockImplementationOnce(async (args) => {
      const result = await save(args);
      page.store.setSelectedLineId({ selectedLineId: "line-2" });
      return result;
    });

    await handleSystemActionsActionDelete(page.deps, {
      _event: { detail: { actionType: "background" } },
    });

    expect(page.savedLine("line-1").actions.background).toEqual({});
    expect(page.savedLine("line-2").actions.background).toBeUndefined();
  });

  it("shows a line action edit at once and keeps it its own step when typing goes on while drafts save", async () => {
    const page = createPage();
    // The save interval counts from the last save, so start past it.
    vi.advanceTimersByTime(30000);
    await page.type("line-1", "Hello there");
    const sync = page.deps.projectService.syncSectionLinesSnapshot;
    const save = sync.getMockImplementation();
    sync.mockImplementationOnce(async (args) => {
      const result = await save(args);
      await page.type("line-1", "Hello there!");
      return result;
    });

    await handleSystemActionsActionDelete(page.deps, {
      _event: { detail: { actionType: "background" } },
    });
    const line = () => page.store.selectScene().sections[0].lines[0];
    expect(line().actions.background).toEqual({});

    handleUndoButtonClick(page.deps);
    expect(line().actions.background).toEqual({ resourceId: "bg-1" });
    expect(page.pageLines()[0].text).toBe("Hello there!");
  });

  it("does not run a line action edit when saving the drafts before it fails", async () => {
    const page = createPage();
    await page.type("line-1", "Hello there");
    page.deps.projectService.syncSectionLinesSnapshot.mockRejectedValueOnce(
      new Error("Storage is full"),
    );

    await handleSystemActionsActionDelete(page.deps, {
      _event: { detail: { actionType: "background" } },
    });

    expect(page.deps.appService.showAlert).toHaveBeenCalledOnce();
    expect(page.deps.projectService.updateLineActions).not.toHaveBeenCalled();
  });

  it("waits while the actions dialog is open", async () => {
    const page = createPage();
    await page.type("line-1", "Hello there");
    page.store.setActionTargetLineId({ lineId: "line-1" });

    handleUndoButtonClick(page.deps);
    expect(page.pageLines()[0].text).toBe("Hello there");

    page.store.clearActionTargetLineId();
    handleUndoButtonClick(page.deps);
    expect(page.pageLines()[0].text).toBe("Hello world");
  });

  it("moves the caret to a change undone in another section", async () => {
    const page = createPage();
    await page.type("line-3", "Third line", "section-2");
    page.store.setSelectedSectionId({ selectedSectionId: "section-1" });
    page.store.setSelectedLineId({ selectedLineId: "line-1" });

    handleUndoButtonClick(page.deps);

    expect(page.pageLines("section-2")[0].text).toBe("Third");
    expect(page.editors[1].focusLine).toHaveBeenCalledWith({
      sectionId: "section-2",
      lineId: "line-3",
      cursorPosition: 5,
    });
  });

  it("drops a step whose section is gone", async () => {
    const page = createPage();
    await page.type("line-3", "Third line", "section-2");
    page.updateRepository((draft) => {
      const sections = draft.scenes.items["scene-1"].sections;
      delete sections.items["section-2"];
      sections.tree = [{ id: "section-1" }];
    });
    page.store.setRepositoryState({
      repository: page.deps.projectService.getRepositoryState(),
    });

    handleUndoButtonClick(page.deps);

    expect(page.deps.appService.showToast).toHaveBeenCalledWith({
      message: "This change can't be undone.",
    });
    expect(page.view().undoDisabled).toBe(true);
  });

  it("undoes with the keyboard in the text editor, but not in other fields", async () => {
    const page = createPage();
    await page.type("line-1", "Hello there");
    const editorText = { tagName: "DIV", isContentEditable: true };
    const editor = { tagName: "RVN-LEXICAL-SCENE-DOCUMENT-EDITOR" };

    const inField = shortcut([{ tagName: "INPUT", type: "text" }]);
    handleEditHistoryShortcutKeyDown(page.deps, { _event: inField });
    expect(inField.preventDefault).not.toHaveBeenCalled();
    expect(page.pageLines()[0].text).toBe("Hello there");

    const inEditor = shortcut([editorText, editor]);
    handleEditHistoryShortcutKeyDown(page.deps, { _event: inEditor });
    expect(inEditor.preventDefault).toHaveBeenCalled();
    expect(page.pageLines()[0].text).toBe("Hello world");

    handleEditHistoryShortcutKeyDown(page.deps, {
      _event: shortcut([editorText, editor], { shiftKey: true }),
    });
    expect(page.pageLines()[0].text).toBe("Hello there");
  });

  it("undoes and redoes from the phone toolbar", async () => {
    const page = createPage();
    await page.type("line-1", "Hello there");
    const toolbar = (actionId) =>
      handleMobileKeyboardToolbarActionClick(page.deps, {
        _event: {
          detail: { actionId },
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        },
      });

    toolbar("undo");
    expect(page.pageLines()[0].text).toBe("Hello world");
    toolbar("redo");
    expect(page.pageLines()[0].text).toBe("Hello there");
  });

  it("starts a new history for another scene", async () => {
    const page = createPage();
    await page.type("line-1", "Hello there");
    expect(page.view().undoDisabled).toBe(false);

    page.store.setSceneId({ sceneId: "scene-2" });
    page.store.setSceneId({ sceneId: "scene-1" });

    expect(page.view().undoDisabled).toBe(true);
  });
});
