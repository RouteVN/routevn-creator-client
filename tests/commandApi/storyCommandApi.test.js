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

describe("story command api", () => {
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
});
