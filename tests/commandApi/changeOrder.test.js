import { describe, expect, it, vi } from "vitest";
import { createCommandApi } from "../../src/deps/services/shared/commandApi.js";
import { createProjectRepository } from "../../src/deps/services/shared/projectRepository.js";

// A change is checked against the project state, saved, then applied. Changes
// made while another one is saving must be checked against the state it
// leaves, or a save sent twice stores its files twice.

const createStore = () => ({
  appendEvents: vi.fn(async () => {}),
  loadMaterializedViewCheckpoint: vi.fn(async () => undefined),
  saveMaterializedViewCheckpoint: vi.fn(async () => {}),
  deleteMaterializedViewCheckpoint: vi.fn(async () => {}),
});

const setup = async () => {
  const repository = await createProjectRepository({
    projectId: "project-1",
    store: createStore(),
    events: [],
    historyLoaded: true,
  });
  const storedCommands = [];
  const store = (command) => {
    storedCommands.push(structuredClone(command));
    return command.id;
  };
  const session = {
    getActor: () => ({ userId: "user-1", clientId: "client-1" }),
    submitCommand: vi.fn(async (command) => store(command)),
    submitCommands: vi.fn(async (commands) => commands.map(store)),
  };
  let index = 0;
  const api = createCommandApi({
    idGenerator: () => `id-${++index}`,
    now: () => 1,
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

  return { api, repository, session, storedCommands };
};

const fileRecord = (id, mimeType) => ({
  id,
  mimeType,
  size: 1,
  sha256: "a".repeat(64),
});

const createImageOne = (api) =>
  api.createImage({
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
      fileRecord("file-1", "image/png"),
      fileRecord("thumbnail-1", "image/webp"),
    ],
  });

// The edit dialog keeps the uploaded file until the change is saved, so each
// Save sends the same file records.
const replaceImageOneFile = (api) =>
  api.updateImage({
    imageId: "image-1",
    fileRecords: [
      fileRecord("file-2", "image/png"),
      fileRecord("thumbnail-2", "image/webp"),
    ],
    data: {
      fileId: "file-2",
      thumbnailFileId: "thumbnail-2",
      name: "Image One",
      width: 1920,
      height: 1080,
    },
  });

const describeCommand = ({ type, payload }) =>
  `${type} ${payload.fileId ?? payload.imageId}`;

describe("project changes run one at a time", () => {
  it("stores the files of a save sent twice at once only once", async () => {
    const { api, repository, storedCommands } = await setup();
    await createImageOne(api);
    storedCommands.length = 0;

    const results = await Promise.allSettled([
      replaceImageOneFile(api),
      replaceImageOneFile(api),
    ]);

    expect(storedCommands.map(describeCommand)).toEqual([
      "file.create file-2",
      "file.create thumbnail-2",
      "image.update image-1",
      "image.update image-1",
    ]);
    expect(results).toEqual([
      { status: "fulfilled", value: expect.objectContaining({ valid: true }) },
      { status: "fulfilled", value: expect.objectContaining({ valid: true }) },
    ]);
    expect(repository.getState().images.items["image-1"]).toMatchObject({
      fileId: "file-2",
      thumbnailFileId: "thumbnail-2",
    });
  });

  it("runs the next change after a change that fails", async () => {
    const { api, repository, session } = await setup();
    session.submitCommands.mockRejectedValueOnce(new Error("disk full"));

    const results = await Promise.allSettled([
      createImageOne(api),
      createImageOne(api),
    ]);

    expect(results[0]).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({ message: "disk full" }),
    });
    expect(results[1]).toEqual({ status: "fulfilled", value: "image-1" });
    expect(repository.getState().images.items["image-1"]).toMatchObject({
      fileId: "file-1",
    });
  });
});
