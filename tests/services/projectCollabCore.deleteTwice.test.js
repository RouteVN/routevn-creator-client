import { describe, expect, it, vi } from "vitest";
import { createProjectCollabCore } from "../../src/deps/services/shared/projectCollabCore.js";
import { createProjectRepository } from "../../src/deps/services/shared/projectRepository.js";

// An image stays on the images page until its delete has finished and the
// page refreshed, so it can be sent to delete again while the first delete
// runs. Project changes run one at a time: the second delete is refused
// because the first one removed the image.

const createStore = () => ({
  appendEvents: vi.fn(async () => {}),
  loadMaterializedViewCheckpoint: vi.fn(async () => undefined),
  saveMaterializedViewCheckpoint: vi.fn(async () => {}),
  deleteMaterializedViewCheckpoint: vi.fn(async () => {}),
});

const setup = async () => {
  const store = createStore();
  const repository = await createProjectRepository({
    projectId: "project-1",
    store,
    events: [],
    historyLoaded: true,
  });
  const storedCommands = [];
  const session = {
    getActor: () => ({ userId: "user-1", clientId: "client-1" }),
    submitCommand: vi.fn(async (command) => {
      storedCommands.push(structuredClone(command));
      return command.id;
    }),
    submitCommands: vi.fn(async (commands) => {
      storedCommands.push(...structuredClone(commands));
      return commands.map((command) => command.id);
    }),
  };
  let index = 0;
  const collabCore = createProjectCollabCore({
    router: { getPayload: () => ({ p: "project-1" }) },
    idGenerator: () => `id-${++index}`,
    now: () => 1,
    collabLog: () => {},
    getCurrentRepository: async () => repository,
    getCachedRepository: () => repository,
    getRepositoryByProject: async () => repository,
    getAdapterByProject: () => store,
    createSessionForProject: async () => session,
    createTransport: () => undefined,
    onEnsureLocalSession: () => {},
    onSessionCleared: () => {},
    onSessionTransportUpdated: () => {},
    getOpenProjectId: () => "project-1",
    getOpenRepository: () => repository,
  });

  return { collabCore, repository, storedCommands };
};

const createImageOne = (collabCore) =>
  collabCore.commandApi.createImage({
    imageId: "image-1",
    data: {
      type: "image",
      fileId: "file-1",
      thumbnailFileId: "thumbnail-1",
      name: "Image One",
      width: 960,
      height: 540,
    },
    fileRecords: [
      { id: "file-1", mimeType: "image/png", size: 1, sha256: "a".repeat(64) },
      {
        id: "thumbnail-1",
        mimeType: "image/webp",
        size: 1,
        sha256: "b".repeat(64),
      },
    ],
  });

const imageDeleteCommands = (storedCommands) =>
  storedCommands.filter(({ type }) => type === "image.delete");

describe("deleting the same image twice", () => {
  it("deletes it once when both deletes run at the same time", async () => {
    const { collabCore, repository, storedCommands } = await setup();
    await createImageOne(collabCore);

    const results = await Promise.all([
      collabCore.deleteImageIfUnused({ imageId: "image-1" }),
      collabCore.deleteImageIfUnused({ imageId: "image-1" }),
    ]);

    expect(results.map(({ deleted }) => deleted)).toEqual([true, true]);
    expect(repository.getState().images.items["image-1"]).toBeUndefined();
    expect(imageDeleteCommands(storedCommands)).toHaveLength(1);
  });

  it("treats an image that is already gone as deleted", async () => {
    const { collabCore, storedCommands } = await setup();
    await createImageOne(collabCore);
    await collabCore.deleteImageIfUnused({ imageId: "image-1" });
    storedCommands.length = 0;

    const result = await collabCore.deleteImageIfUnused({
      imageId: "image-1",
    });

    expect(result).toEqual({
      deleted: true,
      usage: { inProps: {}, isUsed: false, count: 0 },
    });
    expect(storedCommands).toEqual([]);
  });
});
