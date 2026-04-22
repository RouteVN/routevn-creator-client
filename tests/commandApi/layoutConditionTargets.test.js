import { describe, expect, it, vi } from "vitest";
import { createLayoutCommandApi } from "../../src/deps/services/shared/commandApi/layouts.js";
import { createCommandApiShared } from "../../src/deps/services/shared/commandApi/shared.js";
import { createProjectRepository } from "../../src/deps/services/shared/projectRepository.js";

const createRepositoryStore = () => {
  return {
    appendEvents: vi.fn(async () => {}),
    loadMaterializedViewCheckpoint: vi.fn(async () => undefined),
    saveMaterializedViewCheckpoint: vi.fn(async () => {}),
    deleteMaterializedViewCheckpoint: vi.fn(async () => {}),
  };
};

describe("commandApi layout condition targets", () => {
  it("accepts dialogue.characterId in layout element conditional overrides", async () => {
    const store = createRepositoryStore();
    const repository = await createProjectRepository({
      projectId: "project-1",
      store,
      events: [],
      historyLoaded: true,
    });
    const session = {
      getActor: vi.fn(() => ({
        userId: "user-1",
        clientId: "client-1",
      })),
      submitCommand: vi.fn(async (command) => command.id),
      submitCommands: vi.fn(async (commands) =>
        commands.map((command) => command.id),
      ),
    };
    const shared = createCommandApiShared({
      idGenerator: (() => {
        let index = 0;
        return () => `cmd-${++index}`;
      })(),
      now: () => 1,
      getCurrentProjectId: () => "project-1",
      getCurrentRepository: async () => repository,
      getCachedRepository: () => repository,
      ensureCommandSessionForProject: async () => session,
      getOrCreateLocalActor: () => ({
        userId: "user-1",
        clientId: "client-1",
      }),
      storyBasePartitionFor: () => "m",
      storyScenePartitionFor: () => "m",
      scenePartitionFor: () => "s:test",
      resourceTypePartitionFor: () => "m",
    });
    const api = createLayoutCommandApi(shared);

    const layoutId = await api.createLayoutItem({
      layoutId: "layout-1",
      name: "Layout One",
      layoutType: "general",
    });

    const elementId = await api.createLayoutElement({
      layoutId,
      elementId: "text-1",
      data: {
        type: "text",
        name: "Speaker Badge",
        x: 0,
        y: 0,
        width: 120,
        height: 24,
        anchorX: 0,
        anchorY: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        conditionalOverrides: [
          {
            when: {
              target: "dialogue.characterId",
              op: "eq",
              value: "character-1",
            },
            set: {
              visible: true,
            },
          },
        ],
      },
    });

    expect(layoutId).toBe("layout-1");
    expect(elementId).toBe("text-1");
    expect(session.submitCommand).toHaveBeenCalledTimes(2);
    expect(
      repository.getState().layouts.items["layout-1"].elements.items["text-1"],
    ).toMatchObject({
      conditionalOverrides: [
        {
          when: {
            target: "dialogue.characterId",
            op: "eq",
            value: "character-1",
          },
          set: {
            visible: true,
          },
        },
      ],
    });
  });
});
