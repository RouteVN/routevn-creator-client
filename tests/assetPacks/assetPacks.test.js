import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { describe, expect, it, vi } from "vitest";
import { COMMAND_TYPES } from "../../src/internal/project/commands.js";
import {
  handleAddFormAction,
  handleAssetPackItemDoubleClick,
  handleFileExplorerAction,
} from "../../src/pages/assetPacks/assetPacks.handlers.js";
import { prepareAssetPacks } from "../../src/pages/assetPacks/support/prepareAssetPacks.js";
import { EN_I18N } from "../support/i18n.js";

const SAVED = {
  schemaVersion: 1,
  resources: [{ resourceType: "images", folderIds: ["folder-1"] }],
};

const createProjectService = ({ saved = SAVED, packs = {} } = {}) => ({
  getCurrentAssetPackage: vi.fn(async () => saved),
  updateCurrentAssetPackage: vi.fn(async (assetPackage) => assetPackage),
  getRepositoryState: vi.fn(() => ({
    assetPacks: { items: packs, tree: [] },
  })),
  createAssetPack: vi.fn(async () => "pack-1"),
});

describe("asset packs", () => {
  it("registers the asset pack commands", () => {
    expect(COMMAND_TYPES).toMatchObject({
      ASSETPACK_CREATE: "assetPack.create",
      ASSETPACK_UPDATE: "assetPack.update",
      ASSETPACK_MOVE: "assetPack.move",
      ASSETPACK_DELETE: "assetPack.delete",
    });
  });

  it("parses its view as YAML", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/assetPacks/assetPacks.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    expect(() => load(view)).not.toThrow();
  });

  it("creates an empty asset pack in the chosen folder", async () => {
    const projectService = { createAssetPack: vi.fn(async () => "pack-1") };
    const store = {
      selectTargetGroupId: vi.fn(() => "folder-1"),
      closeAddDialog: vi.fn(),
      setItems: vi.fn(),
      setSelectedItemId: vi.fn(),
      setSelectedFolderId: vi.fn(),
      selectSelectedItemId: vi.fn(() => undefined),
    };
    await handleAddFormAction(
      {
        appService: { showAlert: vi.fn() },
        i18n: EN_I18N,
        projectService: {
          ...projectService,
          getRepositoryState: vi.fn(() => ({})),
        },
        refs: {},
        render: vi.fn(),
        store,
      },
      {
        _event: {
          detail: {
            actionId: "submit",
            values: { name: "  Fantasy UI ", description: "Menus" },
          },
        },
      },
    );

    expect(projectService.createAssetPack).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: "folder-1",
        position: "last",
        data: {
          type: "assetPack",
          name: "Fantasy UI",
          description: "Menus",
          resources: [],
        },
      }),
    );
    expect(store.closeAddDialog).toHaveBeenCalledOnce();
  });

  it("opens an asset pack in the editor, not a folder", async () => {
    const appService = {
      getPayload: vi.fn(() => ({ p: "project-1" })),
      navigate: vi.fn(),
    };
    handleAssetPackItemDoubleClick(
      { appService },
      { _event: { detail: { itemId: "folder-1", isFolder: true } } },
    );
    expect(appService.navigate).not.toHaveBeenCalled();

    handleAssetPackItemDoubleClick(
      { appService },
      { _event: { detail: { itemId: "pack-1", isFolder: false } } },
    );
    await handleFileExplorerAction(
      { appService },
      {
        _event: { detail: { itemId: "pack-2", item: { value: "edit-item" } } },
      },
    );
    expect(appService.navigate.mock.calls).toEqual([
      ["/project/asset-pack-editor", { p: "project-1", ap: "pack-1" }],
      ["/project/asset-pack-editor", { p: "project-1", ap: "pack-2" }],
    ]);
  });

  it("gives a project without asset packs a folder, and moves its saved package in", async () => {
    const projectService = createProjectService();
    await expect(
      prepareAssetPacks({
        projectService,
        folderName: "Default",
        packName: "Asset Pack",
      }),
    ).resolves.toBe(true);

    const [[folder], [pack]] = projectService.createAssetPack.mock.calls;
    expect(folder).toMatchObject({
      position: "last",
      data: { type: "folder", name: "Default" },
    });
    expect(pack).toMatchObject({
      parentId: folder.assetPackId,
      position: "last",
      data: {
        type: "assetPack",
        name: "Asset Pack",
        description: "",
        resources: SAVED.resources,
      },
    });
    // The old selection is cleared, so it moves only once.
    expect(projectService.updateCurrentAssetPackage).toHaveBeenCalledWith({
      schemaVersion: 1,
      resources: [],
    });
  });

  it("leaves a project's asset packs as they are, clearing its saved package", async () => {
    const withPacks = createProjectService({
      packs: {
        "folder-1": { type: "folder", name: "Menus" },
        "pack-1": { type: "assetPack", name: "Pack" },
      },
    });
    await prepareAssetPacks({
      projectService: withPacks,
      folderName: "Default",
      packName: "Asset Pack",
    });
    expect(withPacks.createAssetPack).not.toHaveBeenCalled();
    expect(withPacks.updateCurrentAssetPackage).toHaveBeenCalledOnce();

    // Nothing saved: only the folder is made.
    const nothingSaved = createProjectService({
      saved: { schemaVersion: 1, resources: [] },
    });
    await prepareAssetPacks({
      projectService: nothingSaved,
      folderName: "Default",
      packName: "Asset Pack",
    });
    expect(
      nothingSaved.createAssetPack.mock.calls.map(([call]) => call.data.type),
    ).toEqual(["folder"]);
    expect(nothingSaved.updateCurrentAssetPackage).not.toHaveBeenCalled();

    // A saved package that cannot be read is left alone.
    const unreadable = createProjectService({
      packs: { "folder-1": { type: "folder", name: "Menus" } },
    });
    unreadable.getCurrentAssetPackage.mockRejectedValue(new Error("missing"));
    await expect(
      prepareAssetPacks({
        projectService: unreadable,
        folderName: "Default",
        packName: "Asset Pack",
      }),
    ).resolves.toBe(false);
  });
});
