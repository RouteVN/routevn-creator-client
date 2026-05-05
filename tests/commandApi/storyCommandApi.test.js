import { describe, expect, it, vi } from "vitest";
import { createStoryCommandApi } from "../../src/deps/services/shared/commandApi/story.js";
import { COMMAND_TYPES } from "../../src/internal/project/commands.js";

const createStoryState = () => ({
  scenes: {
    items: {
      "scene-1": {
        id: "scene-1",
        type: "scene",
        sections: {
          items: {
            "section-1": {
              id: "section-1",
              lines: {
                items: {
                  "line-1": {
                    id: "line-1",
                    actions: {},
                  },
                },
                tree: [{ id: "line-1" }],
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

const createEmptyStoryState = () => ({
  scenes: {
    items: {},
    tree: [],
  },
});

describe("story command api", () => {
  it("creates a scene with its initial section and line in one ordered batch", async () => {
    const context = {
      projectId: "project-1",
      state: createEmptyStoryState(),
    };
    const shared = {
      ensureCommandContext: vi.fn(async () => context),
      createId: vi.fn(() => "generated-id"),
      resolveSceneIndex: vi.fn(() => 0),
      buildPlacementPayload: vi.fn(
        ({ parentId = null, index, position, positionTargetId } = {}) => {
          const payload = {
            parentId,
          };
          if (index !== undefined) {
            payload.index = index;
            return payload;
          }
          payload.position = position;
          if (positionTargetId !== undefined) {
            payload.positionTargetId = positionTargetId;
          }
          return payload;
        },
      ),
      submitCommandsWithContext: vi.fn(async () => ({
        valid: true,
        commandIds: ["cmd-1", "cmd-2", "cmd-3"],
        eventCount: 3,
      })),
      storyScenePartitionFor: vi.fn(() => "m:s:scene-2"),
      scenePartitionFor: vi.fn(() => "s:scene-2"),
    };
    const api = createStoryCommandApi(shared);

    const result = await api.createSceneWithInitialContent({
      sceneId: "scene-2",
      sectionId: "section-2",
      lineId: "line-2",
      data: {
        name: "Scene 2",
      },
      sectionData: {
        name: "Section 1",
      },
      lineData: {
        actions: {
          dialogue: {
            mode: "adv",
          },
        },
      },
    });

    expect(result).toMatchObject({
      valid: true,
      sceneId: "scene-2",
      sectionId: "section-2",
      lineId: "line-2",
      commandIds: ["cmd-1", "cmd-2", "cmd-3"],
      eventCount: 3,
    });
    expect(shared.submitCommandsWithContext).toHaveBeenCalledWith({
      context,
      commands: [
        {
          scope: "story",
          partition: "m:s:scene-2",
          type: COMMAND_TYPES.SCENE_CREATE,
          payload: {
            sceneId: "scene-2",
            parentId: null,
            index: 0,
            data: {
              name: "Scene 2",
            },
          },
        },
        {
          scope: "story",
          partition: "m:s:scene-2",
          type: COMMAND_TYPES.SECTION_CREATE,
          payload: {
            sceneId: "scene-2",
            sectionId: "section-2",
            parentId: null,
            position: "last",
            data: {
              name: "Section 1",
            },
          },
        },
        {
          scope: "story",
          partition: "s:scene-2",
          type: COMMAND_TYPES.LINE_CREATE,
          payload: {
            sectionId: "section-2",
            lines: [
              {
                lineId: "line-2",
                data: {
                  actions: {
                    dialogue: {
                      mode: "adv",
                    },
                  },
                },
              },
            ],
            position: "last",
          },
        },
      ],
    });
  });

  it("omits replace for default line action updates", async () => {
    const context = {
      projectId: "project-1",
      state: createStoryState(),
    };
    const shared = {
      ensureCommandContext: vi.fn(async () => context),
      submitCommandWithContext: vi.fn(async () => ({ valid: true })),
      scenePartitionFor: vi.fn(() => "s:scene-1"),
    };
    const api = createStoryCommandApi(shared);

    await api.updateLineDialogueAction({
      lineId: "line-1",
      dialogue: {
        content: [{ text: "Hello" }],
      },
    });

    expect(shared.submitCommandWithContext).toHaveBeenCalledWith({
      context,
      scope: "story",
      partition: "s:scene-1",
      type: COMMAND_TYPES.LINE_UPDATE_ACTIONS,
      payload: {
        lineId: "line-1",
        data: {
          dialogue: {
            content: [{ text: "Hello" }],
          },
        },
      },
    });
  });

  it("includes preserve when explicitly requested for dialogue metadata updates", async () => {
    const context = {
      projectId: "project-1",
      state: createStoryState(),
    };
    const shared = {
      ensureCommandContext: vi.fn(async () => context),
      submitCommandWithContext: vi.fn(async () => ({ valid: true })),
      scenePartitionFor: vi.fn(() => "s:scene-1"),
    };
    const api = createStoryCommandApi(shared);

    await api.updateLineDialogueAction({
      lineId: "line-1",
      dialogue: {
        characterId: "character-1",
      },
      preserve: ["dialogue.content"],
    });

    expect(shared.submitCommandWithContext).toHaveBeenCalledWith({
      context,
      scope: "story",
      partition: "s:scene-1",
      type: COMMAND_TYPES.LINE_UPDATE_ACTIONS,
      payload: {
        lineId: "line-1",
        data: {
          dialogue: {
            characterId: "character-1",
          },
        },
        preserve: ["dialogue.content"],
      },
    });
  });

  it("still includes replace when explicitly true", async () => {
    const context = {
      projectId: "project-1",
      state: createStoryState(),
    };
    const shared = {
      ensureCommandContext: vi.fn(async () => context),
      submitCommandWithContext: vi.fn(async () => ({ valid: true })),
      scenePartitionFor: vi.fn(() => "s:scene-1"),
    };
    const api = createStoryCommandApi(shared);

    await api.updateLineActions({
      lineId: "line-1",
      data: {
        dialogue: {
          clear: true,
        },
      },
      replace: true,
    });

    expect(shared.submitCommandWithContext).toHaveBeenCalledWith({
      context,
      scope: "story",
      partition: "s:scene-1",
      type: COMMAND_TYPES.LINE_UPDATE_ACTIONS,
      payload: {
        lineId: "line-1",
        data: {
          dialogue: {
            clear: true,
          },
        },
        replace: true,
      },
    });
  });

  it("logs the section line snapshot diff before submitting commands", async () => {
    const context = {
      projectId: "project-1",
      state: {
        scenes: {
          items: {
            "scene-1": {
              id: "scene-1",
              type: "scene",
              sections: {
                items: {
                  "section-1": {
                    id: "section-1",
                    lines: {
                      items: {
                        "line-1": {
                          id: "line-1",
                          actions: {
                            dialogue: {
                              content: [{ text: "Old" }],
                            },
                          },
                        },
                        "line-2": {
                          id: "line-2",
                          actions: {},
                        },
                      },
                      tree: [{ id: "line-1" }, { id: "line-2" }],
                    },
                  },
                },
                tree: [{ id: "section-1" }],
              },
            },
          },
          tree: [{ id: "scene-1" }],
        },
      },
    };
    const shared = {
      ensureCommandContext: vi.fn(async () => context),
      submitCommandsWithContext: vi.fn(async () => ({ valid: true })),
      scenePartitionFor: vi.fn(() => "s:scene-1"),
      storyBasePartitionFor: vi.fn(() => "m"),
    };
    const api = createStoryCommandApi(shared);

    await api.syncSectionLinesSnapshot({
      sectionId: "section-1",
      lines: [
        {
          id: "line-3",
          actions: {},
        },
        {
          id: "line-1",
          actions: {
            dialogue: {
              content: [{ text: "New" }],
            },
          },
        },
      ],
    });

    expect(shared.submitCommandsWithContext).toHaveBeenCalledWith({
      context,
      commands: [
        {
          scope: "story",
          type: COMMAND_TYPES.LINE_DELETE,
          payload: {
            lineIds: ["line-2"],
          },
          partition: "s:scene-1",
        },
        {
          scope: "story",
          type: COMMAND_TYPES.LINE_CREATE,
          payload: {
            sectionId: "section-1",
            lines: [
              {
                lineId: "line-3",
                data: {
                  actions: {},
                },
              },
            ],
            index: 0,
          },
          partition: "s:scene-1",
        },
        {
          scope: "story",
          type: COMMAND_TYPES.LINE_UPDATE_ACTIONS,
          payload: {
            lineId: "line-1",
            data: {
              dialogue: {
                content: [{ text: "New" }],
              },
            },
          },
          partition: "s:scene-1",
        },
      ],
    });
  });
});
