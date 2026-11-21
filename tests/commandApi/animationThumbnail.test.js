import { describe, expect, it, vi } from "vitest";
import { createResourceCommandApi } from "../../src/deps/services/shared/commandApi/resources/index.js";
import { createCommandApiShared } from "../../src/deps/services/shared/commandApi/shared.js";
import {
  createProjectRepository,
  createRepositoryCommandEvent,
} from "../../src/deps/services/shared/projectRepository.js";

// An animation's thumbnail and its source hash, saved through the real command
// API into a real repository, as the thumbnail service saves them.

const createRepositoryStore = () => ({
  appendEvents: vi.fn(async () => {}),
  loadMaterializedViewCheckpoint: vi.fn(async () => undefined),
  saveMaterializedViewCheckpoint: vi.fn(async () => {}),
  deleteMaterializedViewCheckpoint: vi.fn(async () => {}),
});

const setupProject = async () => {
  const repository = await createProjectRepository({
    projectId: "project-1",
    store: createRepositoryStore(),
    events: [],
    historyLoaded: true,
  });
  // The session stores each submitted command as JSON.
  const storedCommands = [];
  const store = (command) => {
    storedCommands.push(JSON.parse(JSON.stringify(command)));
    return command.id;
  };
  const session = {
    getActor: () => ({ userId: "user-1", clientId: "client-1" }),
    submitCommand: vi.fn(async (command) => store(command)),
    submitCommands: vi.fn(async (commands) => commands.map(store)),
  };
  let index = 0;
  const shared = createCommandApiShared({
    idGenerator: () => `id-${++index}`,
    now: () => 1,
    errorTracker: { capture: vi.fn() },
    getCurrentProjectId: () => "project-1",
    getCurrentRepository: async () => repository,
    getCachedRepository: () => repository,
    ensureCommandSessionForProject: async () => session,
    getOrCreateLocalActor: () => ({ userId: "user-1", clientId: "client-1" }),
    storyBasePartitionFor: () => "m",
    storyScenePartitionFor: () => "m",
    scenePartitionFor: () => "s:test",
    resourceTypePartitionFor: () => "m",
  });

  return {
    repository,
    resources: createResourceCommandApi(shared),
    // The project as it loads again from what was stored.
    reload: () =>
      createProjectRepository({
        projectId: "project-1",
        store: createRepositoryStore(),
        events: storedCommands.map((command) =>
          createRepositoryCommandEvent({ command }),
        ),
        historyLoaded: true,
      }),
  };
};

const fileRecord = (id) => ({
  id,
  mimeType: "image/jpeg",
  size: 1,
  sha256: `${id}-sha256`,
});

const createAnimationWithThumbnail = async (project) => {
  await project.resources.createAnimation({
    animationId: "animation-1",
    data: {
      type: "animation",
      name: "Animation One",
      animation: {
        type: "update",
        tween: { alpha: { keyframes: [{ duration: 100, value: 1 }] } },
      },
    },
  });
  return project.resources.updateAnimation({
    animationId: "animation-1",
    data: { thumbnailFileId: "thumb-1", thumbnailSourceHash: "hash-1" },
    fileRecords: [fileRecord("thumb-1")],
  });
};

describe("animation thumbnail commands", () => {
  it("saves an animation's thumbnail with its source hash, and keeps both through an edit and a reload", async () => {
    const project = await setupProject();

    const saved = await createAnimationWithThumbnail(project);

    expect(saved?.valid).not.toBe(false);
    expect(
      project.repository.getState().animations.items["animation-1"],
    ).toMatchObject({
      thumbnailFileId: "thumb-1",
      thumbnailSourceHash: "hash-1",
    });
    expect(project.repository.getState().files.items["thumb-1"]).toMatchObject({
      mimeType: "image/jpeg",
    });

    // The editor saves the whole animation, without its thumbnail.
    await project.resources.updateAnimation({
      animationId: "animation-1",
      data: {
        name: "Animation Two",
        description: "",
        animation: {
          type: "update",
          tween: { alpha: { keyframes: [{ duration: 300, value: 0 }] } },
        },
      },
    });

    const reloaded = await project.reload();
    expect(reloaded.getState().animations.items["animation-1"]).toMatchObject({
      name: "Animation Two",
      thumbnailFileId: "thumb-1",
      thumbnailSourceHash: "hash-1",
    });
  });

  it("drops the hash when a new thumbnail is saved without one", async () => {
    const project = await setupProject();
    await createAnimationWithThumbnail(project);

    await project.resources.updateAnimation({
      animationId: "animation-1",
      data: { thumbnailFileId: "thumb-2" },
      fileRecords: [fileRecord("thumb-2")],
    });

    const animation =
      project.repository.getState().animations.items["animation-1"];
    expect(animation.thumbnailFileId).toBe("thumb-2");
    expect(animation).not.toHaveProperty("thumbnailSourceHash");
  });

  it("duplicates an animation with its thumbnail and source hash", async () => {
    const project = await setupProject();
    await createAnimationWithThumbnail(project);

    const duplicateId = await project.resources.duplicateAnimation({
      animationId: "animation-1",
    });

    const reloaded = await project.reload();
    const { items, tree } = reloaded.getState().animations;
    expect(typeof duplicateId).toBe("string");
    expect(duplicateId).not.toBe("animation-1");
    expect(items[duplicateId]).toMatchObject({
      type: "animation",
      thumbnailFileId: "thumb-1",
      thumbnailSourceHash: "hash-1",
      animation: items["animation-1"].animation,
    });
    expect(items[duplicateId].name).not.toBe(items["animation-1"].name);
    expect(tree.map((node) => node.id)).toEqual(["animation-1", duplicateId]);
  });
});
