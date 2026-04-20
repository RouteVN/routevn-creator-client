import { afterEach, describe, expect, it, vi } from "vitest";
import { createSceneEditorSession } from "../../src/internal/ui/sceneEditor/editorSession.js";
import {
  handleMergeLinesOperation,
  handleSplitLineOperation,
} from "../../src/internal/ui/sceneEditor/lineOperations.js";

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

const createLine = (id, text) => ({
  id,
  sectionId: "section-1",
  actions: {
    dialogue: {
      content: [{ text }],
    },
  },
});

const createScene = () => ({
  sections: [
    {
      id: "section-1",
      lines: [createLine("line-1", "first"), createLine("line-2", "second")],
    },
  ],
});

const createDeps = () => {
  const scene = createScene();
  const section = scene.sections[0];
  const editorSession = createSceneEditorSession({
    sceneId: "scene-1",
    sectionId: "section-1",
    section,
    revision: 1,
  });

  return {
    store: {
      selectSelectedSectionId: vi.fn(() => "section-1"),
      selectLockingLineId: vi.fn(() => null),
      selectScene: vi.fn(() => scene),
      setLockingLineId: vi.fn(),
      clearLockingLineId: vi.fn(),
      selectEditorSession: vi.fn(() => editorSession),
      setSelectedLineId: vi.fn(),
      setEditorSession: vi.fn(),
    },
    projectService: {
      getRepositoryState: vi.fn(() => ({})),
    },
    render: vi.fn(),
    subject: {
      dispatch: vi.fn(),
    },
    refs: {
      linesEditor: {
        focusLine: vi.fn(() => true),
      },
    },
  };
};

describe("sceneEditor line operations render behavior", () => {
  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  });

  it("uses skipRender canvas refresh after splitting a line", async () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    const deps = createDeps();

    await handleSplitLineOperation(deps, {
      _event: {
        detail: {
          lineId: "line-1",
          leftContent: "fir",
          rightContent: "st",
        },
      },
    });

    expect(deps.render).toHaveBeenCalledOnce();
    expect(deps.subject.dispatch).toHaveBeenCalledWith(
      "sceneEditor.renderCanvas",
      {
        skipRender: true,
      },
    );
  });

  it("uses skipRender canvas refresh after merging lines", async () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    const deps = createDeps();

    await handleMergeLinesOperation(deps, {
      _event: {
        detail: {
          currentLineId: "line-2",
        },
      },
    });

    expect(deps.render).toHaveBeenCalledOnce();
    expect(deps.subject.dispatch).toHaveBeenCalledWith(
      "sceneEditor.renderCanvas",
      {
        skipRender: true,
      },
    );
  });
});
