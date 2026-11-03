import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { describe, expect, it, vi } from "vitest";
import { COMMAND_TYPES } from "../../src/internal/project/commands.js";
import {
  handleAddFormAction,
  handleAfterMount,
  handleAssetPackItemDoubleClick,
  handleDetailExportClick,
  handleFileExplorerAction,
} from "../../src/pages/assetPacks/assetPacks.handlers.js";
import {
  createInitialState,
  selectViewData,
  setItems,
  setSelectedItemId,
} from "../../src/pages/assetPacks/assetPacks.store.js";
import { prepareAssetPacks } from "../../src/pages/assetPacks/support/prepareAssetPacks.js";
import { EN_I18N } from "../support/i18n.js";

const SAVED = {
  schemaVersion: 1,
  resources: [{ resourceType: "images", folderIds: ["folder-1"] }],
};

const IMAGES = {
  items: {
    "folder-1": { id: "folder-1", type: "folder", name: "Backgrounds" },
    "folder-2": { id: "folder-2", type: "folder", name: "Night" },
    "image-1": { id: "image-1", type: "image", name: "City" },
  },
  tree: [
    {
      id: "folder-1",
      children: [{ id: "folder-2", children: [{ id: "image-1" }] }],
    },
  ],
};

const createProjectService = ({
  saved = SAVED,
  packs = {},
  images = IMAGES,
} = {}) => ({
  getCurrentAssetPackage: vi.fn(async () => saved),
  updateCurrentAssetPackage: vi.fn(async (assetPackage) => assetPackage),
  getRepositoryState: vi.fn(() => ({
    assetPacks: { items: packs, tree: [] },
    images,
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

  it("offers Export beside Open, unless the pack has nothing picked", () => {
    const state = createInitialState();
    setItems(
      { state },
      {
        data: {
          items: {
            "pack-1": {
              id: "pack-1",
              type: "assetPack",
              name: "Pack One",
              resources: [{ resourceType: "images", folderIds: ["folder-1"] }],
            },
            "pack-2": {
              id: "pack-2",
              type: "assetPack",
              name: "Pack Two",
              resources: [],
            },
          },
          tree: [{ id: "pack-1" }, { id: "pack-2" }],
        },
      },
    );
    const viewDataFor = (itemId) => {
      setSelectedItemId({ state }, { itemId });
      return selectViewData({ state, i18n: EN_I18N });
    };

    expect(viewDataFor("pack-1")).toMatchObject({
      exportButton: "Export",
      selectedItemExportDisabled: false,
    });
    expect(viewDataFor("pack-2").selectedItemExportDisabled).toBe(true);
  });

  it("offers Export in the mobile detail sheet, as in the detail panel", () => {
    const viewSource = readFileSync(
      new URL(
        "../../src/pages/assetPacks/assetPacks.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const view = load(viewSource);
    expect(view.refs.mobileDetailExportButton.eventListeners.click).toEqual({
      handler: "handleDetailExportClick",
      preventDefault: true,
      stopPropagation: true,
    });
    expect(view.refs.detailExportButton.eventListeners.click.handler).toBe(
      "handleDetailExportClick",
    );
    expect(viewSource).toContain(
      "rtgl-button#mobileDetailExportButton w=1fg v=se pre=download ?disabled=${selectedItemExportDisabled}: ${exportButton}",
    );
    expect(viewSource).toContain(
      "rtgl-button#detailExportButton w=1fg v=se pre=download ?disabled=${selectedItemExportDisabled}: ${exportButton}",
    );
  });

  it("exports the selected asset pack as it is saved", async () => {
    const appService = {
      saveFilePicker: vi.fn(async () => "/exports/Pack One.zip"),
      showProgressDialog: vi.fn(() => ({
        waitForPaint: vi.fn(async () => {}),
        update: vi.fn(),
        close: vi.fn(),
      })),
      writeFile: vi.fn(async (path) => path),
      showAlert: vi.fn(),
      showToast: vi.fn(),
    };
    const projectService = {
      getRepositoryState: vi.fn(() => ({
        files: { items: {} },
        colors: {
          items: {
            "color-folder": {
              id: "color-folder",
              type: "folder",
              name: "Palette",
            },
            "color-1": {
              id: "color-1",
              type: "color",
              name: "Red",
              hex: "#ff0000",
            },
          },
          tree: [{ id: "color-folder", children: [{ id: "color-1" }] }],
        },
        assetPacks: {
          items: {
            "pack-1": {
              id: "pack-1",
              type: "assetPack",
              name: "Pack One",
              resources: [
                { resourceType: "colors", folderIds: ["color-folder"] },
              ],
            },
          },
          tree: [{ id: "pack-1" }],
        },
      })),
      createAssetPackageBundle: vi.fn(async () => new Blob(["zip"])),
    };
    const store = {
      selectSelectedItemId: vi.fn(() => "pack-1"),
      selectSelectedItem: vi.fn(() => ({ id: "pack-1", name: "Pack One" })),
    };

    await handleDetailExportClick({
      appService,
      i18n: EN_I18N,
      projectService,
      store,
    });

    expect(appService.showToast).not.toHaveBeenCalled();
    expect(appService.saveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: "Pack One.zip" }),
    );
    const { manifest } =
      projectService.createAssetPackageBundle.mock.calls[0][0];
    expect(Object.keys(manifest.repository.colors.items).sort()).toEqual([
      "color-1",
      "color-folder",
    ]);
    expect(appService.writeFile).toHaveBeenCalledWith(
      "/exports/Pack One.zip",
      expect.any(Blob),
    );
    expect(appService.showAlert).toHaveBeenCalledOnce();
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
    ).resolves.toEqual({ changed: true });

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
    ).resolves.toEqual({ changed: false });
  });

  it("moves only the saved folders the project still has, at any depth", async () => {
    const projectService = createProjectService({
      saved: {
        schemaVersion: 1,
        resources: [
          {
            resourceType: "images",
            folderIds: ["deleted-folder", "folder-2", "image-1", "folder-1"],
          },
          { resourceType: "sounds", folderIds: ["deleted-sound-folder"] },
        ],
      },
    });
    await expect(
      prepareAssetPacks({
        projectService,
        folderName: "Default",
        packName: "Asset Pack",
      }),
    ).resolves.toEqual({ changed: true });

    const [, [pack]] = projectService.createAssetPack.mock.calls;
    // A type left with no folders is dropped.
    expect(pack.data.resources).toEqual([
      { resourceType: "images", folderIds: ["folder-2", "folder-1"] },
    ]);
    expect(projectService.updateCurrentAssetPackage).toHaveBeenCalledOnce();

    // A selection left empty makes no pack, and is cleared.
    const nothingLeft = createProjectService({
      saved: {
        schemaVersion: 1,
        resources: [{ resourceType: "images", folderIds: ["deleted-folder"] }],
      },
    });
    await expect(
      prepareAssetPacks({
        projectService: nothingLeft,
        folderName: "Default",
        packName: "Asset Pack",
      }),
    ).resolves.toEqual({ changed: true });
    expect(
      nothingLeft.createAssetPack.mock.calls.map(([call]) => call.data.type),
    ).toEqual(["folder"]);
    expect(nothingLeft.updateCurrentAssetPackage).toHaveBeenCalledWith({
      schemaVersion: 1,
      resources: [],
    });
  });

  it("keeps the saved selection and says why when it cannot become a pack", async () => {
    const refusal = { valid: false, error: { message: "Refused" } };
    const refused = createProjectService();
    refused.createAssetPack
      .mockResolvedValueOnce("folder-1")
      .mockResolvedValueOnce(refusal);
    await expect(
      prepareAssetPacks({
        projectService: refused,
        folderName: "Default",
        packName: "Asset Pack",
      }),
    ).resolves.toEqual({ changed: true, packError: refusal });
    expect(refused.updateCurrentAssetPackage).not.toHaveBeenCalled();

    const error = new Error("Storage unavailable");
    const throwing = createProjectService({
      packs: { "folder-1": { type: "folder", name: "Menus" } },
    });
    throwing.createAssetPack.mockRejectedValue(error);
    await expect(
      prepareAssetPacks({
        projectService: throwing,
        folderName: "Default",
        packName: "Asset Pack",
      }),
    ).resolves.toEqual({ changed: false, packError: error });
    expect(throwing.updateCurrentAssetPackage).not.toHaveBeenCalled();

    // A folder that cannot be made stops it, and says why.
    const noFolder = createProjectService();
    noFolder.createAssetPack.mockResolvedValue(refusal);
    await expect(
      prepareAssetPacks({
        projectService: noFolder,
        folderName: "Default",
        packName: "Asset Pack",
      }),
    ).resolves.toEqual({ changed: false, folderError: refusal });
    expect(noFolder.createAssetPack).toHaveBeenCalledOnce();
  });

  it("alerts when the asset packs cannot be readied, and still refreshes", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback) => callback());
    vi.spyOn(console, "error").mockImplementation(() => {});
    const createDeps = (projectService) => ({
      appService: {
        getAppCopy: vi.fn(() => EN_I18N.appPage),
        showAlert: vi.fn(),
      },
      i18n: EN_I18N,
      projectService,
      refs: {},
      render: vi.fn(),
      store: {
        setItems: vi.fn(),
        selectSelectedItemId: vi.fn(() => undefined),
      },
    });

    const refused = createProjectService();
    refused.createAssetPack
      .mockResolvedValueOnce("folder-1")
      .mockResolvedValueOnce({ valid: false, error: { message: "Refused" } });
    let deps = createDeps(refused);
    await handleAfterMount(deps);
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      title: "Error",
      message:
        "Could not move this project's earlier asset package into Asset Packs. It will be tried again the next time you open Asset Packs.\n\nDetails:\nRefused",
    });
    // The folder it made shows.
    expect(deps.store.setItems).toHaveBeenCalled();

    // Clearing the saved selection throws after the pack is made.
    const throwing = createProjectService();
    throwing.updateCurrentAssetPackage.mockRejectedValue(
      new Error("Storage unavailable"),
    );
    deps = createDeps(throwing);
    await handleAfterMount(deps);
    expect(deps.appService.showAlert).toHaveBeenCalledOnce();
    expect(deps.appService.showAlert.mock.calls[0][0].message).toContain(
      "Details:\nStorage unavailable",
    );
    expect(deps.store.setItems).toHaveBeenCalled();

    const noFolder = createProjectService();
    noFolder.createAssetPack.mockResolvedValue({
      valid: false,
      error: { message: "Refused" },
    });
    deps = createDeps(noFolder);
    await handleAfterMount(deps);
    expect(deps.appService.showAlert.mock.calls[0][0].message).toBe(
      "Failed to create asset pack folder.\n\nDetails:\nRefused",
    );
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
