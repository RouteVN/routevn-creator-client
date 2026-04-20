import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleCommandLineSubmit,
  handleDialogueCharacterShortcut,
  handleEditorDataChanged,
  handleLineNavigation,
} from "../../src/pages/sceneEditor/sceneEditor.handlers.js";

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

const createStore = ({ selectedLineId = "line-2" } = {}) => {
  let currentSelectedLineId = selectedLineId;
  const scene = {
    sections: [
      {
        id: "section-1",
        lines: [{ id: "line-1" }, { id: "line-2" }, { id: "line-3" }],
      },
    ],
  };

  return {
    selectIsSectionsOverviewOpen: vi.fn(() => false),
    selectSelectedLineId: vi.fn(() => currentSelectedLineId),
    setSelectedLineId: vi.fn(({ selectedLineId: nextLineId }) => {
      currentSelectedLineId = nextLineId;
    }),
    selectPreviousLineId: vi.fn(({ lineId }) => {
      if (lineId === "line-3") {
        return "line-2";
      }
      if (lineId === "line-2") {
        return "line-1";
      }
      return "line-1";
    }),
    selectNextLineId: vi.fn(({ lineId }) => {
      if (lineId === "line-1") {
        return "line-2";
      }
      if (lineId === "line-2") {
        return "line-3";
      }
      return "line-3";
    }),
    selectScene: vi.fn(() => scene),
    selectSelectedSectionId: vi.fn(() => "section-1"),
  };
};

describe("sceneEditor.handlers line navigation", () => {
  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  });

  it("uses the current selected line when a stale text-editor navigation target arrives", () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    const store = createStore({
      selectedLineId: "line-2",
    });
    const deps = {
      store,
      refs: {},
      render: vi.fn(),
      subject: {
        dispatch: vi.fn(),
      },
    };

    handleLineNavigation(deps, {
      _event: {
        detail: {
          targetLineId: "line-1",
          mode: "text-editor",
          direction: "down",
          targetCursorPosition: 5,
        },
      },
    });

    expect(store.selectNextLineId).toHaveBeenCalledWith({
      lineId: "line-2",
    });
    expect(store.setSelectedLineId).toHaveBeenCalledWith({
      selectedLineId: "line-3",
    });
  });
});

describe("sceneEditor.handlers dialogue persistence", () => {
  it("preserves dialogue content when submitting dialogue metadata changes", async () => {
    const updateLineDialogueAction = vi.fn(async () => ({ valid: true }));
    const store = {
      selectSelectedLineId: vi.fn(() => "line-1"),
      selectSelectedLine: vi.fn(() => ({
        id: "line-1",
        actions: {
          dialogue: {
            content: [{ text: "Existing text" }],
            characterId: "character-1",
          },
        },
      })),
      setRepositoryState: vi.fn(),
      setDomainState: vi.fn(),
      setRepositoryRevision: vi.fn(),
      selectSceneId: vi.fn(() => undefined),
      selectSelectedSectionId: vi.fn(() => undefined),
      clearEditorSession: vi.fn(),
    };
    const deps = {
      store,
      render: vi.fn(),
      subject: {
        dispatch: vi.fn(),
      },
      projectService: {
        updateLineDialogueAction,
        getRepositoryState: vi.fn(() => ({})),
        getDomainState: vi.fn(() => ({})),
        getRepositoryRevision: vi.fn(() => 1),
      },
      appService: {
        showAlert: vi.fn(),
      },
    };

    await handleCommandLineSubmit(deps, {
      _event: {
        detail: {
          dialogue: {
            characterId: "character-2",
          },
        },
      },
    });

    expect(updateLineDialogueAction).toHaveBeenCalledWith({
      lineId: "line-1",
      dialogue: {
        characterId: "character-2",
      },
      preserve: ["dialogue.content"],
    });
  });

  it("preserves dialogue content when clearing the dialogue character shortcut", async () => {
    const updateLineDialogueAction = vi.fn(async () => ({ valid: true }));
    const store = {
      selectIsSectionsOverviewOpen: vi.fn(() => false),
      selectSelectedLineId: vi.fn(() => "line-1"),
      selectSelectedSectionId: vi.fn(() => "section-1"),
      selectSelectedLine: vi.fn(() => ({
        id: "line-1",
        actions: {
          dialogue: {
            content: [{ text: "Existing text" }],
            characterId: "character-1",
            ui: {
              resourceId: "layout-1",
            },
            mode: "adv",
          },
        },
      })),
      selectScene: vi.fn(() => ({
        sections: [
          {
            id: "section-1",
            lines: [
              {
                id: "line-1",
                actions: {
                  dialogue: {
                    content: [{ text: "Existing text" }],
                    characterId: "character-1",
                    ui: {
                      resourceId: "layout-1",
                    },
                    mode: "adv",
                  },
                },
              },
            ],
          },
        ],
      })),
      setRepositoryState: vi.fn(),
      setDomainState: vi.fn(),
      setRepositoryRevision: vi.fn(),
      selectSceneId: vi.fn(() => undefined),
      clearEditorSession: vi.fn(),
    };
    const deps = {
      store,
      projectService: {
        updateLineDialogueAction,
        getRepositoryState: vi.fn(() => ({})),
        getDomainState: vi.fn(() => ({})),
        getRepositoryRevision: vi.fn(() => 1),
      },
      render: vi.fn(),
      subject: {
        dispatch: vi.fn(),
      },
    };

    await handleDialogueCharacterShortcut(deps, {
      _event: {
        detail: {
          lineId: "line-1",
          shortcut: "0",
        },
      },
    });

    expect(updateLineDialogueAction).toHaveBeenCalledWith({
      lineId: "line-1",
      dialogue: {
        ui: {
          resourceId: "layout-1",
        },
        mode: "adv",
      },
      preserve: ["dialogue.content"],
    });
  });
});

describe("sceneEditor.handlers editor data changes", () => {
  it("ignores stale blur updates that disagree with the current session text", async () => {
    const setEditorSession = vi.fn();
    const store = {
      selectIsSectionsOverviewOpen: vi.fn(() => false),
      selectSelectedLineId: vi.fn(() => "line-1"),
      selectEditorSession: vi.fn(() => ({
        sceneId: "scene-1",
        sectionId: "section-1",
        lineOrder: ["line-1"],
        linesById: {
          "line-1": {
            line: {
              id: "line-1",
              actions: {
                dialogue: {
                  content: [{ text: "fresh session text" }],
                },
              },
            },
          },
        },
      })),
      setEditorSession,
    };
    const deps = {
      store,
      subject: {
        dispatch: vi.fn(),
      },
    };

    await handleEditorDataChanged(deps, {
      _event: {
        detail: {
          lineId: "line-1",
          content: "stale dom text",
          source: "blur",
        },
      },
    });

    expect(setEditorSession).not.toHaveBeenCalled();
    expect(deps.subject.dispatch).not.toHaveBeenCalled();
  });
});
