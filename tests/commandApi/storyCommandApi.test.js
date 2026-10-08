import { describe, expect, it, vi } from "vitest";
import {
  chunkByJsonBytes,
  createStoryCommandApi,
} from "../../src/deps/services/shared/commandApi/story.js";
import {
  applyCommandsToRepositoryState,
  initialProjectData,
} from "../../src/deps/services/shared/projectRepository.js";
import {
  mainScenePartitionFor,
  scenePartitionFor,
} from "../../src/deps/services/shared/collab/partitions.js";
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

  it("deletes scene-owned voices before deleting the scene in one batch", async () => {
    const context = {
      projectId: "project-1",
      state: createStoryState(),
    };
    const shared = {
      ensureCommandContext: vi.fn(async () => context),
      submitCommandsWithContext: vi.fn(async () => ({
        valid: true,
        commandIds: ["cmd-voice-delete", "cmd-scene-delete"],
        eventCount: 2,
      })),
      resourceTypePartitionFor: vi.fn(() => "r:voices"),
      storyScenePartitionFor: vi.fn(() => "m:s:scene-1"),
    };
    const api = createStoryCommandApi(shared);

    await api.deleteSceneItem({
      sceneIds: ["scene-1"],
      voiceIds: ["voice-1", "voice-2"],
    });

    expect(shared.submitCommandsWithContext).toHaveBeenCalledWith({
      context,
      commands: [
        {
          scope: "resources",
          basePartition: "r:voices",
          type: COMMAND_TYPES.VOICE_DELETE,
          payload: {
            voiceIds: ["voice-1", "voice-2"],
          },
        },
        {
          scope: "story",
          partition: "m:s:scene-1",
          type: COMMAND_TYPES.SCENE_DELETE,
          payload: {
            sceneIds: ["scene-1"],
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

  it("saves all actions of the lines marked in a section line snapshot", async () => {
    const lineActions = (background) => ({
      background: { resourceId: background },
      dialogue: { content: [{ text: "Same" }] },
    });
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
                          actions: lineActions("bg-1"),
                        },
                        "line-2": {
                          id: "line-2",
                          actions: lineActions("bg-1"),
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

    // Line 1 is marked and its background changed; line 2 is not marked, so
    // only its dialogue counts and it is unchanged.
    await api.syncSectionLinesSnapshot({
      sectionId: "section-1",
      lines: [
        { id: "line-1", actions: lineActions("bg-2") },
        { id: "line-2", actions: lineActions("bg-2") },
      ],
      actionLineIds: ["line-1"],
    });

    expect(shared.submitCommandsWithContext).toHaveBeenCalledWith({
      context,
      commands: [
        {
          scope: "story",
          type: COMMAND_TYPES.LINE_UPDATE_ACTIONS,
          payload: {
            lineId: "line-1",
            data: lineActions("bg-2"),
            replace: true,
          },
          partition: "s:scene-1",
        },
      ],
    });

    // A marked line whose actions are already saved writes nothing.
    shared.submitCommandsWithContext.mockClear();
    await api.syncSectionLinesSnapshot({
      sectionId: "section-1",
      lines: [
        { id: "line-1", actions: lineActions("bg-1") },
        { id: "line-2", actions: lineActions("bg-1") },
      ],
      actionLineIds: ["line-1"],
    });
    expect(shared.submitCommandsWithContext).not.toHaveBeenCalled();
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

// The sync client rejects an event over 64 KiB (UTF-8 bytes of the whole
// message), so no line command may come close to that.
const SYNC_EVENT_LIMIT_BYTES = 64 * 1024;
// The budget covers the array of lines or ids; the command adds a few dozen
// bytes of wrapper around it, so allow 1 KiB and still stay at half the limit.
const COMMAND_PAYLOAD_BUDGET_BYTES = 32 * 1024 + 1024;
const byteLength = (value) =>
  new TextEncoder().encode(JSON.stringify(value)).length;

describe("chunkByJsonBytes", () => {
  it("keeps small lists in one run and preserves order", () => {
    expect(chunkByJsonBytes(["a", "b", "c"], 1000)).toEqual([["a", "b", "c"]]);
    expect(chunkByJsonBytes([], 1000)).toEqual([]);
  });

  it("splits runs at the byte budget without reordering or dropping items", () => {
    const items = Array.from({ length: 10 }, (_, index) => `item-${index}`);
    const chunks = chunkByJsonBytes(items, 30);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat()).toEqual(items);
    for (const chunk of chunks) {
      expect(byteLength(chunk)).toBeLessThanOrEqual(30);
    }
  });

  it("counts UTF-8 bytes, not characters", () => {
    // 20 characters, 60 bytes each in UTF-8.
    const items = Array.from({ length: 4 }, () => "あ".repeat(20));
    expect(JSON.stringify(items).length).toBeLessThan(120);
    expect(byteLength(items)).toBeGreaterThan(200);

    const chunks = chunkByJsonBytes(items, 130);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(byteLength(chunk)).toBeLessThanOrEqual(130);
    }
  });

  it("gives an item that is too large on its own a run of its own", () => {
    const huge = "x".repeat(500);
    expect(chunkByJsonBytes(["a", huge, "b"], 100)).toEqual([
      ["a"],
      [huge],
      ["b"],
    ]);
  });
});

describe("story command api: saving a large section snapshot", () => {
  const createLine = (id, text) => ({
    id,
    actions: { dialogue: { content: [{ text }] } },
  });

  const createSectionContext = (lineIds = []) => {
    const lineItems = Object.fromEntries(
      lineIds.map((id) => [id, { id, actions: {} }]),
    );
    return {
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
                      items: lineItems,
                      tree: lineIds.map((id) => ({ id })),
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
  };

  const createApi = (context) => {
    const shared = {
      ensureCommandContext: vi.fn(async () => context),
      submitCommandsWithContext: vi.fn(async () => ({ valid: true })),
      scenePartitionFor: vi.fn(() => "s:scene-1"),
      storyBasePartitionFor: vi.fn(() => "m"),
    };
    return { shared, api: createStoryCommandApi(shared) };
  };

  const submittedCommands = (shared) => {
    expect(shared.submitCommandsWithContext).toHaveBeenCalledTimes(1);
    return shared.submitCommandsWithContext.mock.calls[0][0].commands;
  };

  it("saves a long paste as several line create commands in one submit", async () => {
    const { shared, api } = createApi(createSectionContext(["line-0"]));
    const pasted = Array.from({ length: 700 }, (_, index) =>
      createLine(`new-${index}`, `Line ${index}: ${"word ".repeat(16)}`),
    );

    const result = await api.syncSectionLinesSnapshot({
      sectionId: "section-1",
      lines: [{ id: "line-0", actions: {} }, ...pasted],
    });

    expect(result).toEqual({ valid: true });
    const commands = submittedCommands(shared);
    const creates = commands.filter(
      (command) => command.type === COMMAND_TYPES.LINE_CREATE,
    );
    expect(creates.length).toBeGreaterThan(1);

    let expectedIndex = 1;
    for (const command of creates) {
      expect(byteLength(command.payload)).toBeLessThanOrEqual(
        COMMAND_PAYLOAD_BUDGET_BYTES,
      );
      expect(command.payload.index).toBe(expectedIndex);
      expectedIndex += command.payload.lines.length;
    }
    expect(
      creates.flatMap((command) =>
        command.payload.lines.map((line) => line.lineId),
      ),
    ).toEqual(pasted.map((line) => line.id));
  });

  it("budgets by UTF-8 bytes so Japanese text is split too", async () => {
    const { shared, api } = createApi(createSectionContext());
    // About 22,500 characters but about 68,000 bytes in total.
    const pasted = Array.from({ length: 150 }, (_, index) =>
      createLine(`jp-${index}`, "あ".repeat(150)),
    );
    expect(JSON.stringify(pasted).length).toBeLessThan(SYNC_EVENT_LIMIT_BYTES);

    await api.syncSectionLinesSnapshot({
      sectionId: "section-1",
      lines: pasted,
    });

    const creates = submittedCommands(shared).filter(
      (command) => command.type === COMMAND_TYPES.LINE_CREATE,
    );
    expect(creates.length).toBeGreaterThan(1);
    for (const command of creates) {
      expect(byteLength(command.payload)).toBeLessThanOrEqual(
        COMMAND_PAYLOAD_BUDGET_BYTES,
      );
    }
  });

  it("keeps one create command when the new lines are small", async () => {
    const { shared, api } = createApi(createSectionContext());

    await api.syncSectionLinesSnapshot({
      sectionId: "section-1",
      lines: [createLine("a", "one"), createLine("b", "two")],
    });

    const creates = submittedCommands(shared).filter(
      (command) => command.type === COMMAND_TYPES.LINE_CREATE,
    );
    expect(creates).toHaveLength(1);
    expect(creates[0].payload.index).toBe(0);
    expect(creates[0].payload.lines.map((line) => line.lineId)).toEqual([
      "a",
      "b",
    ]);
  });

  it("splits each run of new lines around existing lines with the right indexes", async () => {
    const { shared, api } = createApi(
      createSectionContext(["keep-1", "keep-2"]),
    );
    const text = "y".repeat(2000);
    const firstRun = Array.from({ length: 40 }, (_, index) =>
      createLine(`first-${index}`, text),
    );
    const secondRun = Array.from({ length: 40 }, (_, index) =>
      createLine(`second-${index}`, text),
    );

    await api.syncSectionLinesSnapshot({
      sectionId: "section-1",
      lines: [
        { id: "keep-1", actions: {} },
        ...firstRun,
        { id: "keep-2", actions: {} },
        ...secondRun,
      ],
    });

    const creates = submittedCommands(shared).filter(
      (command) => command.type === COMMAND_TYPES.LINE_CREATE,
    );
    expect(creates.length).toBeGreaterThan(2);
    const firstRunCreates = creates.filter((command) =>
      command.payload.lines[0].lineId.startsWith("first-"),
    );
    const secondRunCreates = creates.filter((command) =>
      command.payload.lines[0].lineId.startsWith("second-"),
    );
    expect(firstRunCreates[0].payload.index).toBe(1);
    expect(secondRunCreates[0].payload.index).toBe(1 + 40 + 1);
    for (const run of [firstRunCreates, secondRunCreates]) {
      let next = run[0].payload.index;
      for (const command of run) {
        expect(command.payload.index).toBe(next);
        next += command.payload.lines.length;
      }
    }
  });

  it("splits a large delete into several commands", async () => {
    const lineIds = Array.from(
      { length: 4000 },
      (_, index) => `old-line-${index}`,
    );
    const { shared, api } = createApi(createSectionContext(lineIds));

    await api.syncSectionLinesSnapshot({ sectionId: "section-1", lines: [] });

    const deletes = submittedCommands(shared).filter(
      (command) => command.type === COMMAND_TYPES.LINE_DELETE,
    );
    expect(deletes.length).toBeGreaterThan(1);
    for (const command of deletes) {
      expect(byteLength(command.payload)).toBeLessThanOrEqual(
        COMMAND_PAYLOAD_BUDGET_BYTES,
      );
    }
    expect(deletes.flatMap((command) => command.payload.lineIds)).toEqual(
      lineIds,
    );
  });

  it("applies the split commands through the project model in the pasted order", () => {
    const projectId = "project-1";
    const repositoryState = structuredClone(initialProjectData);
    repositoryState.story.initialSceneId = "scene-1";
    repositoryState.scenes = {
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
                  items: { "line-0": { id: "line-0", actions: {} } },
                  tree: [{ id: "line-0" }],
                },
              },
            },
            tree: [{ id: "section-1" }],
          },
        },
      },
      tree: [{ id: "scene-1" }],
    };
    const context = { projectId, state: repositoryState };
    const shared = {
      ensureCommandContext: vi.fn(async () => context),
      submitCommandsWithContext: vi.fn(async () => ({ valid: true })),
      scenePartitionFor: vi.fn((_projectId, sceneId) =>
        scenePartitionFor(sceneId),
      ),
      storyBasePartitionFor: vi.fn(() => "m"),
    };
    const api = createStoryCommandApi(shared);
    const pasted = Array.from({ length: 900 }, (_, index) =>
      createLine(`new-${index}`, `Line ${index}: ${"word ".repeat(18)}`),
    );

    return api
      .syncSectionLinesSnapshot({
        sectionId: "section-1",
        lines: [{ id: "line-0", actions: {} }, ...pasted],
      })
      .then(() => {
        const commands = submittedCommands(shared).map((command, index) => ({
          id: `command-${index}`,
          projectId,
          partition: command.partition,
          type: command.type,
          payload: command.payload,
          actor: { userId: "user-1", clientId: "client-1" },
          clientTs: index + 1,
          schemaVersion: 1,
        }));
        // Without the split this is one command of about 190 KB.
        expect(commands.length).toBeGreaterThan(1);
        for (const command of commands) {
          expect(byteLength(command)).toBeLessThan(SYNC_EVENT_LIMIT_BYTES);
        }

        const applied = applyCommandsToRepositoryState({
          repositoryState,
          commands,
          projectId,
        });
        expect(applied.valid).toBe(true);
        const section =
          applied.repositoryState.scenes.items["scene-1"].sections.items[
            "section-1"
          ];
        expect(section.lines.tree.map((node) => node.id)).toEqual([
          "line-0",
          ...pasted.map((line) => line.id),
        ]);
      });
  });
});

describe("story command api: duplicating and moving a large section", () => {
  const LINE_TEXT = `${"A long line of dialogue. ".repeat(6)}`;
  const createSectionLines = (count, prefix = "line") =>
    Array.from({ length: count }, (_, index) => ({
      id: `${prefix}-${index}`,
      actions: { dialogue: { content: [{ text: `${index}: ${LINE_TEXT}` }] } },
    }));

  const createTwoSceneState = (lines) => ({
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
                name: "Long section",
                lines: {
                  items: Object.fromEntries(
                    lines.map((item) => [item.id, item]),
                  ),
                  tree: lines.map(({ id }) => ({ id })),
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
          sections: { items: {}, tree: [] },
        },
      },
      tree: [{ id: "scene-1" }, { id: "scene-2" }],
    },
  });

  const buildPlacementPayload = ({
    parentId = null,
    index,
    position,
    positionTargetId,
  } = {}) => {
    const payload = { parentId };
    if (index !== undefined) {
      payload.index = index;
      return payload;
    }
    payload.position = position;
    if (positionTargetId !== undefined) {
      payload.positionTargetId = positionTargetId;
    }
    return payload;
  };

  const createShared = (context) => {
    let nextId = 0;
    return {
      ensureCommandContext: vi.fn(async () => context),
      createId: vi.fn(() => `copy-${nextId++}`),
      resolveSectionIndex: vi.fn(() => 0),
      buildPlacementPayload: vi.fn(buildPlacementPayload),
      submitCommandsWithContext: vi.fn(async () => ({ valid: true })),
      scenePartitionFor: vi.fn((_projectId, sceneId) =>
        scenePartitionFor(sceneId),
      ),
      storyScenePartitionFor: vi.fn((_projectId, sceneId) =>
        mainScenePartitionFor(sceneId),
      ),
      storyBasePartitionFor: vi.fn(() => "m"),
    };
  };

  const submitted = (shared) =>
    shared.submitCommandsWithContext.mock.calls[0][0].commands;

  it("duplicates a large section as several line create commands, in order", async () => {
    const lines = createSectionLines(700);
    const context = {
      projectId: "project-1",
      state: createTwoSceneState(lines),
    };
    const shared = createShared(context);
    const api = createStoryCommandApi(shared);

    await api.duplicateSectionItem({ sectionId: "section-1" });

    const commands = submitted(shared);
    expect(commands[0].type).toBe(COMMAND_TYPES.SECTION_CREATE);
    const creates = commands.slice(1);
    expect(creates.length).toBeGreaterThan(1);
    for (const command of creates) {
      expect(command.type).toBe(COMMAND_TYPES.LINE_CREATE);
      expect(command.payload.position).toBe("last");
      expect(command.payload.sectionId).toBe(commands[0].payload.sectionId);
      expect(byteLength(command.payload)).toBeLessThanOrEqual(
        COMMAND_PAYLOAD_BUDGET_BYTES,
      );
    }
    expect(
      creates.flatMap((command) =>
        command.payload.lines.map(
          (line) => line.data.actions.dialogue.content[0].text,
        ),
      ),
    ).toEqual(lines.map((line) => line.actions.dialogue.content[0].text));
  });

  it("moves a large section to another scene with several delete and create commands", async () => {
    const lines = createSectionLines(700);
    const context = {
      projectId: "project-1",
      state: createTwoSceneState(lines),
    };
    const shared = createShared(context);
    const api = createStoryCommandApi(shared);

    await api.moveSectionItem({
      sectionId: "section-1",
      sceneId: "scene-2",
      position: "last",
    });

    const commands = submitted(shared);
    const types = commands.map((command) => command.type);
    const moveIndex = types.indexOf(COMMAND_TYPES.SECTION_MOVE);
    const deletes = commands.slice(0, moveIndex);
    const creates = commands.slice(moveIndex + 1);
    // The lines leave the source scene, the section moves, then the lines are
    // created in the target scene, in their order.
    expect(deletes.length).toBeGreaterThanOrEqual(1);
    expect(
      deletes.every((command) => command.type === COMMAND_TYPES.LINE_DELETE),
    ).toBe(true);
    expect(creates.length).toBeGreaterThan(1);
    expect(
      creates.every((command) => command.type === COMMAND_TYPES.LINE_CREATE),
    ).toBe(true);
    for (const command of [...deletes, ...creates]) {
      expect(byteLength(command.payload)).toBeLessThanOrEqual(
        COMMAND_PAYLOAD_BUDGET_BYTES,
      );
    }
    expect(deletes.flatMap((command) => command.payload.lineIds)).toEqual(
      lines.map((line) => line.id),
    );
    expect(
      creates.flatMap((command) =>
        command.payload.lines.map((line) => line.lineId),
      ),
    ).toEqual(lines.map((line) => line.id));
  });

  it("applies a split duplicate through the project model with the lines in order", async () => {
    const projectId = "project-1";
    const lines = createSectionLines(900);
    const repositoryState = structuredClone(initialProjectData);
    repositoryState.story.initialSceneId = "scene-1";
    repositoryState.scenes = createTwoSceneState(lines).scenes;
    const context = { projectId, state: repositoryState };
    const shared = createShared(context);
    shared.buildPlacementPayload.mockImplementation(buildPlacementPayload);
    const api = createStoryCommandApi(shared);

    await api.duplicateSectionItem({ sectionId: "section-1" });

    const commands = submitted(shared).map((command, index) => ({
      id: `command-${index}`,
      projectId,
      partition: command.partition,
      type: command.type,
      payload: command.payload,
      actor: { userId: "user-1", clientId: "client-1" },
      clientTs: index + 1,
      schemaVersion: 1,
    }));
    expect(commands.length).toBeGreaterThan(2);
    for (const command of commands) {
      expect(byteLength(command)).toBeLessThan(SYNC_EVENT_LIMIT_BYTES);
    }

    const applied = applyCommandsToRepositoryState({
      repositoryState,
      commands,
      projectId,
    });
    expect(applied.valid).toBe(true);
    const sections =
      applied.repositoryState.scenes.items["scene-1"].sections.items;
    const copyId = commands[0].payload.sectionId;
    const copiedTexts = sections[copyId].lines.tree.map(
      ({ id }) =>
        sections[copyId].lines.items[id].actions.dialogue.content[0].text,
    );
    expect(copiedTexts).toEqual(
      lines.map((line) => line.actions.dialogue.content[0].text),
    );
  });
});
