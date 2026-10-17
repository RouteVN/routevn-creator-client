import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as storeModule from "../../src/pages/sceneEditorLexical/sceneEditorLexical.store.js";
import {
  handleCommandLineSubmit,
  handleDialogueCharacterShortcut,
  handleDropdownMenuClickItem,
  handleLineDeleteActionItem,
  handleSystemActionsActionDelete,
} from "../../src/pages/sceneEditorLexical/sceneEditorLexical.handlers.js";
import { createStoryCommandApi } from "../../src/deps/services/shared/commandApi/story.js";
import { scenePartitionFor } from "../../src/deps/services/shared/collab/partitions.js";
import { selectSceneEditorCopy } from "../../src/internal/ui/sceneEditor/sceneEditorCopy.js";
import { EN_I18N, JA_I18N } from "../support/i18n.js";

const MISSING_LINE_MESSAGE = "payload.lineId must reference an existing line";

const line = (id, text, actions = {}) => ({
  id,
  actions: { ...actions, dialogue: { content: [{ text }] } },
});

const toLineItems = (lines) => ({
  items: Object.fromEntries(
    lines.map((item) => [item.id, structuredClone(item)]),
  ),
  tree: lines.map(({ id }) => ({ id })),
});

const createProjectState = (lines) => ({
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
              lines: toLineItems(lines),
            },
          },
          tree: [{ id: "section-1" }],
        },
      },
    },
    tree: [{ id: "scene-1" }],
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

// The page shows "line-2", the line the command is for, but the project no
// longer has it, as when a line is deleted after a command for it was made.
// The page's line commands run through the real story command API.
const createPage = ({ i18n = EN_I18N } = {}) => {
  const pageState = createProjectState([
    line("line-1", "First"),
    line("line-2", "Second", { background: { resourceId: "image-1" } }),
  ]);
  const storedState = createProjectState([line("line-1", "First")]);
  const store = bindStore(storeModule.createInitialState());
  store.setSceneId({ sceneId: "scene-1" });
  store.setRepositoryState({ repository: pageState });
  store.setRepositoryRevision({ revision: 1 });
  store.setSelectedSectionId({ selectedSectionId: "section-1" });
  store.setSelectedLineId({ selectedLineId: "line-2" });

  const shared = {
    ensureCommandContext: vi.fn(async () => ({
      projectId: "project-1",
      state: structuredClone(storedState),
    })),
    submitCommandWithContext: vi.fn(async () => ({ valid: true })),
    scenePartitionFor: (_projectId, sceneId) => scenePartitionFor(sceneId),
  };
  const storyCommandApi = createStoryCommandApi(shared);

  const deps = {
    store,
    i18n,
    render: vi.fn(),
    refs: {},
    subject: { dispatch: vi.fn() },
    graphicsService: { engineSelectSectionLineChanges: vi.fn(() => ({})) },
    appService: {
      showAlert: vi.fn(),
      getPayload: () => ({}),
      setPayload: vi.fn(),
    },
    projectService: {
      updateLineActions: storyCommandApi.updateLineActions,
      updateLineDialogueAction: storyCommandApi.updateLineDialogueAction,
      getRepositoryState: () => pageState,
      getDomainState: () => ({}),
      getRepositoryRevision: () => 1,
      cacheSceneTextStats: vi.fn(async () => {}),
    },
  };

  return { deps, shared };
};

const submitActions = (detail) => (deps) =>
  handleCommandLineSubmit(deps, { _event: { detail } });

const deleteFromActionsPanel = (actionType) => (deps) =>
  handleSystemActionsActionDelete(deps, { _event: { detail: { actionType } } });

const cases = [
  [
    "an actions dialog change",
    submitActions({ background: { resourceId: "image-2" } }),
    "failedSaveLineActions",
  ],
  [
    "a dialogue change from the actions dialog",
    submitActions({ dialogue: { characterId: "character-1" } }),
    "failedSaveDialogueAction",
  ],
  [
    "a section transition",
    submitActions({ sectionTransition: { sectionId: "section-1" } }),
    "failedSaveSectionTransition",
  ],
  [
    "a push overlay",
    submitActions({ pushOverlay: { resourceId: "layout-1" } }),
    "failedSaveLineActions",
  ],
  ["a pop overlay", submitActions({ popOverlay: {} }), "failedSaveLineActions"],
  [
    "a dialogue character shortcut",
    (deps) =>
      handleDialogueCharacterShortcut(deps, {
        _event: { detail: { lineId: "line-2", shortcut: "1" } },
      }),
    "failedSaveDialogueAction",
  ],
  [
    "an action deleted from the actions panel",
    deleteFromActionsPanel("background"),
    "failedSaveLineActions",
  ],
  [
    "a dialogue deleted from the actions panel",
    deleteFromActionsPanel("dialogue"),
    "failedSaveDialogueAction",
  ],
  [
    "an action item deleted",
    (deps) =>
      handleLineDeleteActionItem(deps, {
        _event: { detail: { actionType: "background" } },
      }),
    "failedSaveLineActions",
  ],
  [
    "an action deleted from the action menu",
    (deps) => {
      deps.store.showActionsDropdownMenu({
        position: { x: 0, y: 0 },
        actionsType: "background",
      });
      return handleDropdownMenuClickItem(deps, {
        _event: { detail: { item: { value: "delete-actions" } } },
      });
    },
    "failedSaveLineActions",
  ],
];

describe("scene editor: a line command for a line the project no longer has", () => {
  let consoleError;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(cases)(
    "tells the user that %s could not be saved, and ends it",
    async (_command, runCommand, fallbackKey) => {
      const { deps, shared } = createPage();

      await expect(runCommand(deps)).resolves.toBeUndefined();

      expect(deps.appService.showAlert).toHaveBeenCalledExactlyOnceWith({
        title: "Error",
        message: `${EN_I18N.sceneEditorPage[fallbackKey]}\n\nDetails:\n${MISSING_LINE_MESSAGE}`,
      });
      expect(consoleError).toHaveBeenCalledOnce();
      // Nothing is saved, and the page does not reload the project as after
      // a saved change.
      expect(shared.ensureCommandContext).toHaveBeenCalledWith({
        lineIds: ["line-2"],
      });
      expect(shared.submitCommandWithContext).not.toHaveBeenCalled();
      expect(
        deps.graphicsService.engineSelectSectionLineChanges,
      ).not.toHaveBeenCalled();
      expect(deps.projectService.cacheSceneTextStats).not.toHaveBeenCalled();
      // The command has ended, so undo and redo work again.
      expect(deps.store.selectIsEditHistoryBlocked()).toBe(false);
    },
  );

  it("leads with the message in the user's language", async () => {
    const { deps } = createPage({ i18n: JA_I18N });
    const copy = selectSceneEditorCopy(JA_I18N);

    await expect(
      submitActions({ background: { resourceId: "image-2" } })(deps),
    ).resolves.toBeUndefined();

    expect(deps.appService.showAlert).toHaveBeenCalledExactlyOnceWith({
      title: copy.errorTitle,
      message: `${copy.failedSaveLineActions}\n\n${copy.errorDetailsLabel}\n${MISSING_LINE_MESSAGE}`,
    });
    expect(copy.failedSaveLineActions).not.toBe(
      EN_I18N.sceneEditorPage.failedSaveLineActions,
    );
  });
});
