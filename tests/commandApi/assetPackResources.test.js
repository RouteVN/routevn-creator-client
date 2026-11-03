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

    // As the editor saves: from the picks it last saved.
    let baseResources = [];
    const save = async (resources) => {
      submittedBatches.length = 0;
      const result = await api.updateAssetPackResources({
        assetPackId: "pack-1",
        baseResources,
        resources,
      });
      if (result.valid !== false) {
        baseResources = resources;
      }
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

    // A new first type goes first.
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
  const createPack = async (api) => {
    for (const [colorId, parentId] of [
      ["colors-a", undefined],
      ["colors-b", undefined],
      ["colors-a-inner", "colors-a"],
    ]) {
      await api.createColor({
        colorId,
        parentId,
        data: { type: "folder", name: colorId },
      });
    }
    for (const [textStyleId, parentId] of [
      ["styles-a", undefined],
      ["styles-a-inner", "styles-a"],
    ]) {
      await api.createTextStyle({
        textStyleId,
        parentId,
        data: { type: "folder", name: textStyleId },
      });
    }
    await api.createTransform({
      transformId: "transforms-a",
      data: { type: "folder", name: "Transforms" },
    });
    await api.createAssetPack({
      assetPackId: "pack-1",
      data: { type: "assetPack", name: "Pack One" },
    });
  };

  it("saves folders picked at any depth", async () => {
    const { api, savedResources } = await createApi();
    await createPack(api);

    const result = await api.updateAssetPackResources({
      assetPackId: "pack-1",
      baseResources: [],
      resources: [
        { resourceType: "colors", folderIds: ["colors-a-inner", "colors-a"] },
      ],
    });

    expect(result.valid).toBe(true);
    expect(savedResources()).toEqual([
      { resourceType: "colors", folderIds: ["colors-a-inner", "colors-a"] },
    ]);
  });

  it("changes only the types the editor changed, leaving others' changes", async () => {
    const { api, savedResources, submittedBatches } = await createApi();
    await createPack(api);
    const saveFrom = async (baseResources, resources) => {
      submittedBatches.length = 0;
      const result = await api.updateAssetPackResources({
        assetPackId: "pack-1",
        baseResources,
        resources,
      });
      return { result, batches: [...submittedBatches] };
    };
    const colors = { resourceType: "colors", folderIds: ["colors-a"] };
    const editorBase = [colors];
    await saveFrom([], editorBase);

    // Someone else adds text styles while the editor is open.
    await saveFrom(editorBase, [
      colors,
      { resourceType: "textStyles", folderIds: ["styles-a"] },
    ]);

    // The editor changes colors only: text styles stay.
    let saved = await saveFrom(editorBase, [
      { resourceType: "colors", folderIds: ["colors-b"] },
    ]);
    expect(saved.result.valid).toBe(true);
    expect(saved.batches).toEqual([["assetPack.resource.update"]]);
    expect(savedResources()).toEqual([
      { resourceType: "colors", folderIds: ["colors-b"] },
      { resourceType: "textStyles", folderIds: ["styles-a"] },
    ]);

    // An editor that unpicks colors deletes only colors.
    saved = await saveFrom(
      [{ resourceType: "colors", folderIds: ["colors-b"] }],
      [],
    );
    expect(saved.batches).toEqual([["assetPack.resource.delete"]]);
    expect(savedResources()).toEqual([
      { resourceType: "textStyles", folderIds: ["styles-a"] },
    ]);

    // A type the editor unpicks that someone else removed already needs
    // nothing; one it adds that someone else created already is updated
    // with the editor's folders.
    saved = await saveFrom(
      [colors],
      [{ resourceType: "textStyles", folderIds: ["styles-a-inner"] }],
    );
    expect(saved.result.valid).toBe(true);
    expect(saved.batches).toEqual([["assetPack.resource.update"]]);
    expect(savedResources()).toEqual([
      { resourceType: "textStyles", folderIds: ["styles-a-inner"] },
    ]);

    // Added with the same folders as someone else did, it needs nothing.
    saved = await saveFrom(
      [],
      [{ resourceType: "textStyles", folderIds: ["styles-a-inner"] }],
    );
    expect(saved.batches).toEqual([]);

    // A type the editor changed that someone else removed is created again.
    // New types go after the editor's type before them when the pack has
    // that one, or else first.
    saved = await saveFrom(
      [{ resourceType: "colors", folderIds: ["colors-a"] }],
      [
        { resourceType: "colors", folderIds: ["colors-b"] },
        { resourceType: "transforms", folderIds: ["transforms-a"] },
        { resourceType: "textStyles", folderIds: ["styles-a-inner"] },
      ],
    );
    expect(saved.result.valid).toBe(true);
    expect(saved.batches).toEqual([
      ["assetPack.resource.create", "assetPack.resource.create"],
    ]);
    expect(savedResources()).toEqual([
      { resourceType: "colors", folderIds: ["colors-b"] },
      { resourceType: "transforms", folderIds: ["transforms-a"] },
      { resourceType: "textStyles", folderIds: ["styles-a-inner"] },
    ]);

    // After a type the pack does not have, a new type goes first.
    await saveFrom(
      [
        { resourceType: "colors", folderIds: ["colors-b"] },
        { resourceType: "transforms", folderIds: ["transforms-a"] },
      ],
      [],
    );
    saved = await saveFrom(
      [{ resourceType: "colors", folderIds: ["colors-b"] }],
      [
        { resourceType: "colors", folderIds: ["colors-b"] },
        { resourceType: "transforms", folderIds: ["transforms-a"] },
      ],
    );
    expect(saved.batches).toEqual([["assetPack.resource.create"]]);
    expect(savedResources()).toEqual([
      { resourceType: "transforms", folderIds: ["transforms-a"] },
      { resourceType: "textStyles", folderIds: ["styles-a-inner"] },
    ]);
  });

  it("moves a type before or after another, and later types go last", async () => {
    const { api, savedResources, submittedBatches } = await createApi();
    await createPack(api);
    const types = () =>
      savedResources().map(({ resourceType }) => resourceType);
    const colors = { resourceType: "colors", folderIds: ["colors-a"] };
    const textStyles = { resourceType: "textStyles", folderIds: ["styles-a"] };
    const transforms = {
      resourceType: "transforms",
      folderIds: ["transforms-a"],
    };
    await api.updateAssetPackResources({
      assetPackId: "pack-1",
      baseResources: [],
      resources: [colors, textStyles],
    });
    expect(types()).toEqual(["colors", "textStyles"]);

    // Move Down is after the next type.
    submittedBatches.length = 0;
    let result = await api.moveAssetPackResource({
      assetPackId: "pack-1",
      resourceType: "colors",
      position: "after",
      positionTargetResourceType: "textStyles",
    });
    expect(result.valid).toBe(true);
    expect(submittedBatches).toEqual([["assetPack.resource.move"]]);
    expect(types()).toEqual(["textStyles", "colors"]);
    // Folders go with their type.
    expect(savedResources()).toEqual([textStyles, colors]);

    // Move Up is before the previous type.
    result = await api.moveAssetPackResource({
      assetPackId: "pack-1",
      resourceType: "colors",
      position: "before",
      positionTargetResourceType: "textStyles",
    });
    expect(result.valid).toBe(true);
    expect(types()).toEqual(["colors", "textStyles"]);

    // An editor that lists the pack's order, with a type picked since last,
    // saves it last, and a move between types does not disturb that.
    await api.moveAssetPackResource({
      assetPackId: "pack-1",
      resourceType: "textStyles",
      position: "before",
      positionTargetResourceType: "colors",
    });
    const editorResources = [textStyles, colors, transforms];
    result = await api.updateAssetPackResources({
      assetPackId: "pack-1",
      baseResources: [textStyles, colors],
      resources: editorResources,
    });
    expect(result.valid).toBe(true);
    expect(savedResources()).toEqual(editorResources);

    // A move naming a type the pack does not have saves nothing.
    submittedBatches.length = 0;
    result = await api.moveAssetPackResource({
      assetPackId: "pack-1",
      resourceType: "colors",
      position: "before",
      positionTargetResourceType: "layouts",
    });
    expect(result.valid).toBe(false);
    expect(submittedBatches).toEqual([]);
    expect(savedResources()).toEqual(editorResources);
  });
});
