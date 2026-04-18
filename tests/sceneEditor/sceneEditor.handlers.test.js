import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleCommandLineSubmit,
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

const createActionMutationDeps = () => {
  let currentScene = {
    id: "scene-1",
    sections: [
      {
        id: "section-1",
        lines: [
          {
            id: "line-1",
            sectionId: "section-1",
            actions: {
              dialogue: {
                content: [{ text: "Draft text" }],
              },
            },
          },
        ],
      },
    ],
  };
  let selectedLineId = "line-1";
  let repositoryRevision = 1;
  let editorSession = {
    sceneId: "scene-1",
    sectionId: "section-1",
    baseRevision: 1,
    lineOrder: ["line-1"],
    linesById: {
      "line-1": {
        line: {
          id: "line-1",
          sectionId: "section-1",
          actions: {
            dialogue: {
              content: [{ text: "Draft text" }],
            },
          },
        },
        baseText: "",
        dirty: true,
        conflict: false,
        saveState: "scheduled",
      },
    },
    structureDirty: true,
    isComposing: false,
  };

  const store = {
    selectSelectedLineId: vi.fn(() => selectedLineId),
    setSelectedLineId: vi.fn(({ selectedLineId: nextSelectedLineId }) => {
      selectedLineId = nextSelectedLineId;
    }),
    selectSelectedSectionId: vi.fn(() => "section-1"),
    selectSceneId: vi.fn(() => "scene-1"),
    selectScene: vi.fn(() => currentScene),
    selectCommittedScene: vi.fn(() => currentScene),
    selectSelectedLine: vi.fn(
      () =>
        currentScene.sections[0]?.lines.find((line) => line.id === selectedLineId),
    ),
    selectEditorSession: vi.fn(() => editorSession),
    setEditorSession: vi.fn(({ editorSession: nextEditorSession }) => {
      editorSession = nextEditorSession;
    }),
    clearEditorSession: vi.fn(() => {
      editorSession = undefined;
    }),
    selectDraftSaveTimerId: vi.fn(() => undefined),
    clearDraftSaveTimer: vi.fn(),
    setLastDraftFlushStartedAt: vi.fn(),
    setDraftSavePendingSinceAt: vi.fn(),
    setRepositoryState: vi.fn(),
    setDomainState: vi.fn(),
    setRepositoryRevision: vi.fn(({ revision }) => {
      repositoryRevision = revision;
    }),
    selectRepositoryRevision: vi.fn(() => repositoryRevision),
  };

  const projectService = {
    syncSectionLinesSnapshot: vi.fn(async () => {
      currentScene = {
        id: "scene-1",
        sections: [
          {
            id: "section-1",
            lines: [],
          },
        ],
      };
      repositoryRevision += 1;
    }),
    getRepositoryState: vi.fn(() => ({
      scenes: {
        items: {},
      },
    })),
    getDomainState: vi.fn(() => ({
      scenes: {},
      sections: {},
      lines: {},
      story: {},
    })),
    getRepositoryRevision: vi.fn(() => repositoryRevision),
    updateLineDialogueAction: vi.fn(async () => ({
      valid: true,
    })),
    updateLineActions: vi.fn(async () => ({
      valid: true,
    })),
  };

  return {
    deps: {
      store,
      projectService,
      render: vi.fn(),
      subject: {
        dispatch: vi.fn(),
      },
      appService: {
        showAlert: vi.fn(),
      },
    },
    projectService,
    store,
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

  it("flushes pending scene drafts before action submission and skips stale line updates", async () => {
    const { deps, projectService, store } = createActionMutationDeps();

    await handleCommandLineSubmit(deps, {
      _event: {
        detail: {
          background: {
            resourceId: "bg-1",
          },
        },
      },
    });

    expect(projectService.syncSectionLinesSnapshot).toHaveBeenCalledTimes(1);
    expect(projectService.updateLineActions).not.toHaveBeenCalled();
    expect(store.setSelectedLineId).toHaveBeenCalledWith({
      selectedLineId: undefined,
    });
  });
});
