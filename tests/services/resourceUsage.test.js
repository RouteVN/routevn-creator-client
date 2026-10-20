import { describe, expect, it, vi } from "vitest";
import { initialProjectData } from "../../src/deps/services/shared/projectRepository.js";
import {
  checkProjectResourceUsage,
  checkSceneDeleteUsage,
} from "../../src/deps/services/shared/resourceUsage.js";
import { scenePartitionFor } from "../../src/deps/services/shared/collab/partitions.js";

const createLineCollection = (lines = []) => ({
  items: Object.fromEntries(lines.map((line) => [line.id, line])),
  tree: lines.map((line) => ({ id: line.id })),
});

const createSection = ({ id, lines = [] }) => ({
  id,
  name: id,
  lines: createLineCollection(lines),
});

const createScene = ({ id, sections = [] }) => ({
  id,
  type: "scene",
  name: id,
  sections: {
    items: Object.fromEntries(sections.map((section) => [section.id, section])),
    tree: sections.map((section) => ({ id: section.id })),
  },
});

describe("checkProjectResourceUsage", () => {
  it("checks scene checkpoints one by one for scene usage", async () => {
    const repositoryState = structuredClone(initialProjectData);
    repositoryState.sounds.items["sound-1"] = {
      id: "sound-1",
      type: "sound",
      name: "Theme",
      fileId: "file-sound-1",
      fileType: "audio/ogg",
    };
    repositoryState.scenes.items["scene-1"] = createScene({
      id: "scene-1",
      sections: [
        createSection({
          id: "section-1",
        }),
      ],
    });
    repositoryState.scenes.items["scene-2"] = createScene({
      id: "scene-2",
      sections: [
        createSection({
          id: "section-2",
        }),
      ],
    });
    repositoryState.scenes.tree = [{ id: "scene-1" }, { id: "scene-2" }];

    const store = {
      loadMaterializedViewCheckpoint: vi.fn(async ({ partition }) => {
        if (partition === scenePartitionFor("scene-1")) {
          return {
            value: {
              scenes: {
                items: {
                  "scene-1": createScene({
                    id: "scene-1",
                    sections: [
                      createSection({
                        id: "section-1",
                      }),
                    ],
                  }),
                },
              },
            },
          };
        }

        if (partition === scenePartitionFor("scene-2")) {
          return {
            value: {
              scenes: {
                items: {
                  "scene-2": createScene({
                    id: "scene-2",
                    sections: [
                      createSection({
                        id: "section-2",
                        lines: [
                          {
                            id: "line-1",
                            actions: {
                              bgmId: "sound-1",
                            },
                          },
                        ],
                      }),
                    ],
                  }),
                },
              },
            },
          };
        }

        return undefined;
      }),
    };
    const repository = {
      getState: () => structuredClone(repositoryState),
    };

    const usage = await checkProjectResourceUsage({
      repository,
      store,
      projectId: "project-1",
      itemId: "sound-1",
      checkTargets: ["scenes"],
    });

    expect(usage.isUsed).toBe(true);
    expect(usage.count).toBeGreaterThan(0);
    expect(store.loadMaterializedViewCheckpoint).toHaveBeenCalledTimes(2);
    expect(store.loadMaterializedViewCheckpoint).toHaveBeenNthCalledWith(1, {
      viewName: "project_repository_scene_state",
      partition: scenePartitionFor("scene-1"),
    });
    expect(store.loadMaterializedViewCheckpoint).toHaveBeenNthCalledWith(2, {
      viewName: "project_repository_scene_state",
      partition: scenePartitionFor("scene-2"),
    });
  });

  it("counts an image used by a transition mask with the animations target", async () => {
    const repositoryState = structuredClone(initialProjectData);
    repositoryState.images.items["image-1"] = {
      id: "image-1",
      type: "image",
      name: "Wipe mask",
      fileId: "file-image-1",
      width: 64,
      height: 64,
    };
    repositoryState.images.tree = [{ id: "image-1" }];
    repositoryState.animations.items["animation-1"] = {
      id: "animation-1",
      type: "animation",
      name: "Wipe",
      animation: {
        type: "transition",
        mask: {
          kind: "single",
          imageId: "image-1",
          channel: "red",
          softness: 0.1,
          progressDuration: 900,
          progressEasing: "linear",
        },
      },
    };
    repositoryState.animations.tree = [{ id: "animation-1" }];
    const repository = {
      getState: () => structuredClone(repositoryState),
    };
    const store = {
      loadMaterializedViewCheckpoint: vi.fn(async () => undefined),
    };

    const usage = await checkProjectResourceUsage({
      repository,
      store,
      projectId: "project-1",
      itemId: "image-1",
      checkTargets: ["scenes", "layouts", "controls", "animations"],
    });
    expect(usage.isUsed).toBe(true);
    expect(usage.inProps.animations).toHaveLength(1);
    expect(store.loadMaterializedViewCheckpoint).not.toHaveBeenCalled();

    const withoutAnimations = await checkProjectResourceUsage({
      repository,
      store,
      projectId: "project-1",
      itemId: "image-1",
      checkTargets: ["scenes", "layouts", "controls"],
    });
    expect(withoutAnimations.isUsed).toBe(false);
  });

  it("marks a scene as in use when another scene transitions to it", () => {
    const usage = checkSceneDeleteUsage({
      sceneId: "scene-2",
      state: {
        scenes: {
          "scene-1": {
            id: "scene-1",
            type: "scene",
            parentId: null,
          },
          "scene-2": {
            id: "scene-2",
            type: "scene",
            parentId: null,
          },
        },
        story: {
          initialSceneId: "scene-1",
        },
      },
      sceneOverviewsById: {
        "scene-1": {
          outgoingSceneIds: ["scene-2"],
        },
      },
    });

    expect(usage).toEqual({
      isUsed: true,
      count: 1,
      reasons: [
        {
          type: "incoming-scene-transition",
          sceneId: "scene-2",
          sourceSceneId: "scene-1",
        },
      ],
    });
  });
});
