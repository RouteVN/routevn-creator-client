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
  it("rejects deleting a section referenced by another scene projection", async () => {
    const contextState = {
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
                  name: "Intro",
                  lines: {
                    items: {},
                    tree: [],
                  },
                },
              },
              tree: [{ id: "section-1" }],
            },
          },
          "scene-2": {
            id: "scene-2",
            type: "scene",
            name: "Scene 2",
            sections: {
              items: {
                "section-2": {
                  id: "section-2",
                  name: "Branch",
                  lines: {
                    items: {},
                    tree: [],
                  },
                },
              },
              tree: [{ id: "section-2" }],
            },
          },
        },
        tree: [{ id: "scene-1" }, { id: "scene-2" }],
      },
    };
    const fullState = structuredClone(contextState);
    fullState.scenes.items["scene-2"].sections.items["section-2"].lines = {
      items: {
        "line-1": {
          id: "line-1",
          actions: {
            sectionTransition: {
              sceneId: "scene-1",
              sectionId: "section-1",
            },
          },
        },
      },
      tree: [{ id: "line-1" }],
    };
    const context = {
      projectId: "project-1",
      state: contextState,
      repository: {
        getContextState: vi.fn(async () => fullState),
      },
    };
    const shared = {
      ensureCommandContext: vi.fn(async () => context),
      submitCommandWithContext: vi.fn(async () => ({ valid: true })),
    };
    const api = createStoryCommandApi(shared);

    const result = await api.deleteSectionItem({
      sceneId: "scene-1",
      sectionIds: ["section-1"],
    });

    expect(context.repository.getContextState).toHaveBeenCalledWith({
      sceneIds: ["scene-1", "scene-2"],
    });
    expect(result).toEqual({
      valid: false,
      error: {
        message:
          "This section can't be deleted because another section references it.",
        code: "section_referenced",
        details: {
          sceneId: "scene-2",
          sceneName: "Scene 2",
          sectionId: "section-2",
          sectionName: "Branch",
          lineId: "line-1",
          referencedSectionId: "section-1",
        },
      },
    });
    expect(shared.submitCommandWithContext).not.toHaveBeenCalled();
  });

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

  it("moves a section to another scene with its line snapshot", async () => {
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
                              content: [{ text: "Keep me" }],
                            },
                          },
                        },
                      },
                      tree: [{ id: "line-1" }],
                    },
                  },
                },
                tree: [{ id: "section-1" }],
              },
            },
            "scene-2": {
              id: "scene-2",
              type: "scene",
              sections: {
                items: {},
                tree: [],
              },
            },
          },
          tree: [{ id: "scene-1" }, { id: "scene-2" }],
        },
      },
    };
    const shared = {
      ensureCommandContext: vi.fn(async () => context),
      resolveSectionIndex: vi.fn(() => 0),
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
      submitCommandsWithContext: vi.fn(async () => ({ valid: true })),
      scenePartitionFor: vi.fn((_projectId, sceneId) => `s:${sceneId}`),
      storyBasePartitionFor: vi.fn(() => "m"),
    };
    const api = createStoryCommandApi(shared);

    await api.moveSectionItem({
      sectionId: "section-1",
      sceneId: "scene-2",
      position: "last",
    });

    expect(shared.ensureCommandContext).toHaveBeenCalledWith({
      sceneIds: ["scene-2"],
      sectionIds: ["section-1"],
    });
    expect(shared.submitCommandsWithContext).toHaveBeenCalledWith({
      context,
      commands: [
        {
          scope: "story",
          partition: "s:scene-1",
          type: COMMAND_TYPES.LINE_DELETE,
          payload: {
            lineIds: ["line-1"],
          },
        },
        {
          scope: "story",
          partition: "m",
          type: COMMAND_TYPES.SECTION_MOVE,
          payload: {
            sectionId: "section-1",
            parentId: null,
            index: 0,
            sceneId: "scene-2",
          },
        },
        {
          scope: "story",
          partition: "s:scene-2",
          type: COMMAND_TYPES.LINE_CREATE,
          payload: {
            sectionId: "section-1",
            lines: [
              {
                lineId: "line-1",
                data: {
                  actions: {
                    dialogue: {
                      content: [{ text: "Keep me" }],
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

  it("duplicates a section after the source section with cloned lines", async () => {
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
                    name: "Intro",
                    lines: {
                      items: {
                        "line-1": {
                          id: "line-1",
                          actions: {
                            dialogue: {
                              content: [{ text: "Hello" }],
                            },
                          },
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
      },
    };
    const createId = vi
      .fn()
      .mockReturnValueOnce("section-copy")
      .mockReturnValueOnce("line-copy");
    const shared = {
      ensureCommandContext: vi.fn(async () => context),
      createId,
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
      submitCommandsWithContext: vi.fn(async () => ({ valid: true })),
      storyScenePartitionFor: vi.fn((_projectId, sceneId) => `m:s:${sceneId}`),
      scenePartitionFor: vi.fn((_projectId, sceneId) => `s:${sceneId}`),
    };
    const api = createStoryCommandApi(shared);

    const result = await api.duplicateSectionItem({
      sectionId: "section-1",
    });

    expect(result).toBe("section-copy");
    expect(shared.ensureCommandContext).toHaveBeenCalledWith({
      sectionIds: ["section-1"],
    });
    expect(shared.submitCommandsWithContext).toHaveBeenCalledWith({
      context,
      commands: [
        {
          scope: "story",
          partition: "m:s:scene-1",
          type: COMMAND_TYPES.SECTION_CREATE,
          payload: {
            sceneId: "scene-1",
            sectionId: "section-copy",
            parentId: null,
            position: "after",
            positionTargetId: "section-1",
            data: {
              name: "Intro",
            },
          },
        },
        {
          scope: "story",
          partition: "s:scene-1",
          type: COMMAND_TYPES.LINE_CREATE,
          payload: {
            sectionId: "section-copy",
            lines: [
              {
                lineId: "line-copy",
                data: {
                  actions: {
                    dialogue: {
                      content: [{ text: "Hello" }],
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
});
