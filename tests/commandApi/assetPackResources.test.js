import { describe, expect, it, vi } from "vitest";
import { createCatalogResourceCommandApi } from "../../src/deps/services/shared/commandApi/resources/catalog.js";
import { createCommandApiShared } from "../../src/deps/services/shared/commandApi/shared.js";
import { createProjectRepository } from "../../src/deps/services/shared/projectRepository.js";

const createApi = async () => {
  const repository = await createProjectRepository({
    projectId: "project-1",
    store: {
      appendEvents: vi.fn(async () => {}),
      loadMaterializedViewCheckpoint: vi.fn(async () => undefined),
      saveMaterializedViewCheckpoint: vi.fn(async () => {}),
      deleteMaterializedViewCheckpoint: vi.fn(async () => {}),
    },
    events: [],
    historyLoaded: true,
  });
  const actor = { userId: "user-1", clientId: "client-1" };
  const submittedBatches = [];
  const session = {
    getActor: () => actor,
    submitCommand: vi.fn(async () => ({ valid: true })),
    submitCommands: vi.fn(async (commands) => {
      submittedBatches.push(commands.map((command) => command.type));
      return commands.map((command) => command.id);
    }),
  };
  let commandIndex = 0;
  const shared = createCommandApiShared({
    idGenerator: () => `command-${++commandIndex}`,
    now: () => 1,
    getCurrentProjectId: () => "project-1",
    getCurrentRepository: async () => repository,
    getCachedRepository: () => repository,
    ensureCommandSessionForProject: async () => session,
    getOrCreateLocalActor: () => actor,
    storyBasePartitionFor: () => "m",
    storyScenePartitionFor: () => "m",
    scenePartitionFor: () => "m",
    resourceTypePartitionFor: () => "m",
  });
  const api = createCatalogResourceCommandApi(shared);
  const savedResources = () =>
    repository.getState().assetPacks.items["pack-1"].resources;
  return { api, savedResources, submittedBatches };
};

describe("asset pack resources command API", () => {
  it("saves a pack's picks with one command per changed type, in one batch", async () => {
    const { api, savedResources, submittedBatches } = await createApi();
    for (const colorId of ["colors-a", "colors-b"]) {
      expect(
        await api.createColor({
          colorId,
          data: { type: "folder", name: colorId },
        }),
      ).toBe(colorId);
    }
    expect(
      await api.createTextStyle({
        textStyleId: "styles-a",
        data: { type: "folder", name: "Styles" },
      }),
    ).toBe("styles-a");
    expect(
      await api.createAssetPack({
        assetPackId: "pack-1",
        data: { type: "assetPack", name: "Pack One" },
      }),
    ).toBe("pack-1");

    const save = async (resources) => {
      submittedBatches.length = 0;
      const result = await api.updateAssetPackResources({
        assetPackId: "pack-1",
        resources,
      });
      return { result, batches: [...submittedBatches] };
    };

    // New types are created, in the order given.
    let saved = await save([
      { resourceType: "colors", folderIds: ["colors-a"] },
      { resourceType: "textStyles", folderIds: ["styles-a"] },
    ]);
    expect(saved.result.valid).toBe(true);
    expect(saved.batches).toEqual([
      ["assetPack.resource.create", "assetPack.resource.create"],
    ]);
    expect(savedResources()).toEqual([
      { resourceType: "colors", folderIds: ["colors-a"] },
      { resourceType: "textStyles", folderIds: ["styles-a"] },
    ]);

    // A type no longer picked is deleted; a changed one is updated.
    saved = await save([
      { resourceType: "colors", folderIds: ["colors-b", "colors-a"] },
    ]);
    expect(saved.batches).toEqual([
      ["assetPack.resource.delete", "assetPack.resource.update"],
    ]);
    expect(savedResources()).toEqual([
      { resourceType: "colors", folderIds: ["colors-b", "colors-a"] },
    ]);

    // Nothing changed, nothing is sent.
    saved = await save([
      { resourceType: "colors", folderIds: ["colors-b", "colors-a"] },
    ]);
    expect(saved.result.valid).toBe(true);
    expect(saved.batches).toEqual([]);

    // A new first type goes before the others.
    saved = await save([
      { resourceType: "textStyles", folderIds: ["styles-a"] },
      { resourceType: "colors", folderIds: ["colors-b", "colors-a"] },
    ]);
    expect(saved.batches).toEqual([["assetPack.resource.create"]]);
    expect(savedResources().map(({ resourceType }) => resourceType)).toEqual([
      "textStyles",
      "colors",
    ]);

    // One rejected change saves none of them.
    saved = await save([
      { resourceType: "textStyles", folderIds: ["styles-a"] },
      { resourceType: "colors", folderIds: ["colors-a", "missing-folder"] },
    ]);
    expect(saved.result.valid).toBe(false);
    expect(saved.batches).toEqual([]);
    expect(savedResources()).toEqual([
      { resourceType: "textStyles", folderIds: ["styles-a"] },
      { resourceType: "colors", folderIds: ["colors-b", "colors-a"] },
    ]);

    // Unpicking everything leaves the pack with no resources.
    saved = await save([]);
    expect(saved.batches).toEqual([["assetPack.resource.delete"]]);
    expect(savedResources()).toEqual([]);
  });
});
