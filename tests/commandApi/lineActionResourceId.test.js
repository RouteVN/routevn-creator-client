import { describe, expect, it, vi } from "vitest";
import { createCommandApiShared } from "../../src/deps/services/shared/commandApi/shared.js";
import { createStoryCommandApi } from "../../src/deps/services/shared/commandApi/story.js";
import {
  applyCommandsToRepositoryState,
  initialProjectData,
} from "../../src/deps/services/shared/projectRepository.js";

const projectId = "project-1";
const lineId = "line-1";

const createRepositoryState = () => {
  const repositoryState = structuredClone(initialProjectData);
  repositoryState.story.initialSceneId = "scene-1";
  repositoryState.scenes = {
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
              lines: {
                items: {
                  [lineId]: {
                    id: lineId,
                    actions: {
                      background: { resourceId: "image-1" },
                      dialogue: { content: [{ text: "Hello" }] },
                    },
                  },
                },
                tree: [{ id: lineId }],
              },
            },
          },
          tree: [{ id: "section-1" }],
        },
      },
    },
    tree: [{ id: "scene-1" }],
  };
  return repositoryState;
};

const setup = () => {
  const repositoryState = createRepositoryState();
  const repository = {
    getContextState: vi.fn(async () => structuredClone(repositoryState)),
    getState: vi.fn(() => structuredClone(repositoryState)),
    addEvent: vi.fn(async () => {}),
    flushMainCheckpoint: vi.fn(async () => {}),
    isHistoryLoadPending: () => false,
  };
  const session = {
    getActor: vi.fn(() => ({ userId: "user-1", clientId: "client-1" })),
    submitCommand: vi.fn(async (command) => command.id),
    submitCommands: vi.fn(async (commands) =>
      commands.map((command) => command.id),
    ),
  };
  const errorTracker = { capture: vi.fn() };
  const shared = createCommandApiShared({
    idGenerator: (() => {
      let index = 0;
      return () => `cmd-${++index}`;
    })(),
    now: () => 1,
    errorTracker,
    getCurrentProjectId: () => projectId,
    getCurrentRepository: async () => repository,
    getCachedRepository: () => repository,
    ensureCommandSessionForProject: async () => session,
    getOrCreateLocalActor: () => ({ userId: "user-1", clientId: "client-1" }),
    storyBasePartitionFor: () => "m",
    storyScenePartitionFor: () => "m",
    scenePartitionFor: () => "s:test",
    resourceTypePartitionFor: () => "m",
  });
  const api = createStoryCommandApi(shared);

  // The line's actions after the submitted command is applied to its project.
  const savedActions = () => {
    const [command] = session.submitCommand.mock.calls[0];
    const applied = applyCommandsToRepositoryState({
      repositoryState,
      commands: [command],
      projectId,
    });
    expect(applied.valid).toBe(true);
    return applied.repositoryState.scenes.items["scene-1"].sections.items[
      "section-1"
    ].lines.items[lineId].actions;
  };

  return { api, reportError: errorTracker.capture, savedActions };
};

describe("line actions update of a background without a resourceId", () => {
  it("replaces the saved background and reports nothing", async () => {
    const { api, reportError, savedActions } = setup();

    const result = await api.updateLineActions({
      lineId,
      data: { background: { colorId: "color-1" } },
    });

    expect(result).toMatchObject({ valid: true });
    expect(reportError).not.toHaveBeenCalled();
    expect(savedActions()).toEqual({
      background: { colorId: "color-1" },
      dialogue: { content: [{ text: "Hello" }] },
    });
  });

  it("saves the same as a resourceId set to undefined, which is reported", async () => {
    const { api, reportError, savedActions } = setup();

    const result = await api.updateLineActions({
      lineId,
      data: { background: { resourceId: undefined, colorId: "color-1" } },
    });

    expect(result).toMatchObject({ valid: true });
    expect(reportError).toHaveBeenCalledOnce();
    expect(reportError.mock.calls[0][0].message).toBe(
      "line.update_actions: non-JSON value in resourceId",
    );
    expect(savedActions()).toEqual({
      background: { colorId: "color-1" },
      dialogue: { content: [{ text: "Hello" }] },
    });
  });
});
