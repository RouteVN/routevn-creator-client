import { describe, expect, it, vi } from "vitest";
import { runInsiemeStorageScenario } from "../puty/insiemeStorageScenario.js";
import { createStoryCommandApi } from "../../src/deps/services/shared/commandApi/story.js";
import {
  mainScenePartitionFor,
  scenePartitionFor,
} from "../../src/deps/services/shared/collab/partitions.js";

// A long paste saved through the real sync client and a real sync server
// with SQLite, where every command is checked against the project model.
const projectId = "project-large-paste";
const actor = { userId: "user-large-paste", clientId: "client-large-paste" };

const sceneCommands = [
  {
    id: "cmd-scene-create",
    partition: mainScenePartitionFor("scene-1"),
    type: "scene.create",
    payload: { sceneId: "scene-1", data: { name: "Scene 1" } },
  },
  {
    id: "cmd-section-create",
    partition: mainScenePartitionFor("scene-1"),
    type: "section.create",
    payload: {
      sceneId: "scene-1",
      sectionId: "section-1",
      data: { name: "Section 1" },
    },
  },
];

// About 120 KB of dialogue: well over the sync client's 64 KiB per event.
const pastedLines = Array.from({ length: 700 }, (_, index) => ({
  id: `pasted-line-${index}`,
  actions: {
    dialogue: {
      content: [
        {
          text: `Line ${index}: the quick brown fox jumps over the lazy dog, then naps.`,
        },
      ],
    },
  },
}));

const storedLineIds = (storedEvents) =>
  storedEvents
    .filter((event) => event.type === "line.create")
    .flatMap((event) => event.payload.lines.map((line) => line.lineId));

describe("saving a long paste through the real sync client", () => {
  it("refuses the paste as one command, which is why it is split", async () => {
    const { storedEvents } = await runInsiemeStorageScenario({
      projectId,
      actor,
      commands: [
        ...sceneCommands,
        {
          id: "cmd-line-create-all",
          partition: scenePartitionFor("scene-1"),
          type: "line.create",
          payload: {
            sectionId: "section-1",
            lines: pastedLines.map((line) => ({
              lineId: line.id,
              data: { actions: line.actions },
            })),
            index: 0,
          },
        },
      ],
    });

    expect(storedEvents.some((event) => event.type === "section.create")).toBe(
      true,
    );
    expect(storedLineIds(storedEvents)).toEqual([]);
  });

  it("stores every line of the paste, in order, from the split commands", async () => {
    const context = {
      projectId,
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
                    lines: { items: {}, tree: [] },
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
      scenePartitionFor: vi.fn((_projectId, sceneId) =>
        scenePartitionFor(sceneId),
      ),
      storyBasePartitionFor: vi.fn(() => "m"),
    };
    await createStoryCommandApi(shared).syncSectionLinesSnapshot({
      sectionId: "section-1",
      lines: pastedLines,
    });
    const lineCommands =
      shared.submitCommandsWithContext.mock.calls[0][0].commands;
    expect(lineCommands.length).toBeGreaterThan(1);

    const { storedEvents } = await runInsiemeStorageScenario({
      projectId,
      actor,
      commands: [
        ...sceneCommands,
        ...lineCommands.map((command, index) => ({
          id: `cmd-line-create-${index}`,
          partition: command.partition,
          type: command.type,
          payload: command.payload,
        })),
      ],
    });

    expect(storedLineIds(storedEvents)).toEqual(
      pastedLines.map((line) => line.id),
    );
  });
});
