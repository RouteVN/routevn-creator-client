import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it, vi } from "vitest";
import { createCatalogResourceCommandApi } from "../../src/deps/services/shared/commandApi/resources/catalog.js";
import { createCommandApiShared } from "../../src/deps/services/shared/commandApi/shared.js";
import { createProjectRepository } from "../../src/deps/services/shared/projectRepository.js";
import {
  createControlsFileExplorerHandlers,
  createLayoutsFileExplorerHandlers,
  createResourceFileExplorerHandlers,
} from "../../src/internal/ui/fileExplorer.js";
import { selectColorsPageCopy } from "../../src/pages/colors/support/colorsPageCopy.js";

const EN_I18N = yaml.load(
  readFileSync(new URL("../../src/i18n/en.yaml", import.meta.url), "utf8"),
);
const IN_PACK_MESSAGE =
  "The asset pack “Pack One” uses this folder or a folder in it. Remove it from the pack, then delete the folder.";

const createCatalogProject = async () => {
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
  let commandIndex = 0;
  const shared = createCommandApiShared({
    idGenerator: () => `command-${++commandIndex}`,
    now: () => 1,
    getCurrentProjectId: () => "project-1",
    getCurrentRepository: async () => repository,
    getCachedRepository: () => repository,
    ensureCommandSessionForProject: async () => ({
      getActor: () => actor,
      submitCommand: vi.fn(async () => ({ valid: true })),
      submitCommands: vi.fn(async (commands) =>
        commands.map((command) => command.id),
      ),
    }),
    getOrCreateLocalActor: () => actor,
    storyBasePartitionFor: () => "m",
    storyScenePartitionFor: () => "m",
    scenePartitionFor: () => "m",
    resourceTypePartitionFor: () => "m",
  });
  return { api: createCatalogResourceCommandApi(shared), repository };
};

const deleteItem = (handlers, deps, itemId) =>
  handlers.handleFileExplorerAction(deps, {
    _event: { detail: { itemId, item: { value: "delete-item" } } },
  });

describe("deleting a folder an asset pack picks", () => {
  it("keeps the folder and names the pack, through the real model", async () => {
    const { api, repository } = await createCatalogProject();
    await api.createColor({
      colorId: "colors-outer",
      data: { type: "folder", name: "Palettes" },
    });
    await api.createColor({
      colorId: "colors-inner",
      parentId: "colors-outer",
      data: { type: "folder", name: "Warm" },
    });
    await api.createColor({
      colorId: "colors-other",
      data: { type: "folder", name: "Unused" },
    });
    await api.createAssetPack({
      assetPackId: "pack-1",
      data: {
        type: "assetPack",
        name: "Pack One",
        resources: [{ resourceType: "colors", folderIds: ["colors-inner"] }],
      },
    });

    const refresh = vi.fn(async () => {});
    const deps = {
      i18n: EN_I18N,
      appService: { showAlert: vi.fn() },
      projectService: {
        ensureRepository: vi.fn(async () => {}),
        getState: () => repository.getState(),
        deleteColors: (payload) => api.deleteColors(payload),
      },
    };
    const handlers = createResourceFileExplorerHandlers({
      resourceType: "colors",
      refresh,
      copy: ({ i18n }) => selectColorsPageCopy(i18n),
    });

    // The picked folder, and the folder that holds it.
    for (const folderId of ["colors-inner", "colors-outer"]) {
      deps.appService.showAlert.mockClear();
      await deleteItem(handlers, deps, folderId);
      expect(deps.appService.showAlert).toHaveBeenCalledWith({
        message: IN_PACK_MESSAGE,
      });
      expect(repository.getState().colors.items[folderId]).toBeDefined();
    }
    expect(refresh).not.toHaveBeenCalled();

    // A folder no pack picks is deleted as before.
    deps.appService.showAlert.mockClear();
    await deleteItem(handlers, deps, "colors-other");
    expect(deps.appService.showAlert).not.toHaveBeenCalled();
    expect(repository.getState().colors.items["colors-other"]).toBeUndefined();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps showing the general message for other refused deletes", async () => {
    const deps = {
      i18n: EN_I18N,
      appService: { showAlert: vi.fn() },
      projectService: {
        ensureRepository: vi.fn(async () => {}),
        getState: () => ({
          colors: {
            items: { "colors-1": { id: "colors-1", type: "folder" } },
            tree: [{ id: "colors-1" }],
          },
        }),
        deleteColors: vi.fn(async () => ({
          valid: false,
          error: { code: "validation_failed", details: {} },
        })),
      },
    };
    const handlers = createResourceFileExplorerHandlers({
      resourceType: "colors",
      copy: { failedDeleteResource: "Failed to delete resource." },
    });

    await deleteItem(handlers, deps, "colors-1");

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "Failed to delete resource.",
    });
  });

  it.each([
    {
      resourceType: "layouts",
      createHandlers: createLayoutsFileExplorerHandlers,
      deleteMethod: "deleteLayoutItem",
    },
    {
      resourceType: "controls",
      createHandlers: createControlsFileExplorerHandlers,
      deleteMethod: "deleteControlItem",
    },
  ])(
    "names the pack for $resourceType, which said nothing before",
    async ({ resourceType, createHandlers, deleteMethod }) => {
      const refresh = vi.fn(async () => {});
      const deps = {
        i18n: EN_I18N,
        appService: { showAlert: vi.fn() },
        projectService: {
          ensureRepository: vi.fn(async () => {}),
          getState: () => ({
            [resourceType]: {
              items: { "folder-1": { id: "folder-1", type: "folder" } },
              tree: [{ id: "folder-1" }],
            },
          }),
          checkResourceUsage: vi.fn(async () => ({ isUsed: false })),
          [deleteMethod]: vi.fn(async () => ({
            valid: false,
            error: {
              code: "invariant_validation_failed",
              details: {
                assetPackId: "pack-1",
                assetPackName: "Pack One",
                resourceType,
                folderId: "folder-1",
              },
            },
          })),
        },
      };
      const handlers = createHandlers({
        refresh,
        copy: selectColorsPageCopy(EN_I18N),
      });

      await deleteItem(handlers, deps, "folder-1");

      expect(deps.appService.showAlert).toHaveBeenCalledWith({
        message: IN_PACK_MESSAGE,
      });
      expect(refresh).not.toHaveBeenCalled();
    },
  );
});
