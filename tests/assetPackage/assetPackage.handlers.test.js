import { describe, expect, it, vi } from "vitest";
import { ASSET_PACKAGE_RESOURCE_TYPES } from "../../src/internal/assetPackageResources.js";
import {
  handlePickResourcesClick,
  handleAfterMount,
  handleBackClick,
  handleBeforeMount,
  handleDownloadAssetPackageButtonClick,
  handlePickerFolderClick,
  handlePickerClose,
  handlePickerDoneClick,
  handlePickerTypeClick,
} from "../../src/pages/assetPackage/assetPackage.handlers.js";
import { EN_I18N } from "../support/i18n.js";

const ASSET_PACKAGE_REPOSITORY = {
  files: {
    items: {
      "file-image-1": {
        id: "file-image-1",
        mimeType: "image/png",
        source: { url: "./files/file-image-1" },
      },
    },
  },
  images: {
    items: {
      "image-folder-1": {
        id: "image-folder-1",
        type: "folder",
        name: "Backgrounds",
      },
      "image-1": {
        id: "image-1",
        type: "image",
        name: "City",
        fileId: "file-image-1",
      },
    },
    tree: [{ id: "image-folder-1", children: [{ id: "image-1" }] }],
  },
};

const SAVED_ASSET_PACKAGE = {
  schemaVersion: 1,
  resources: [{ resourceType: "images", folderIds: ["image-folder-1"] }],
};

const createRepositoryState = () => {
  const state = {
    files: { items: {} },
    assetPacks: {
      items: {
        "pack-1": {
          id: "pack-1",
          type: "assetPack",
          name: "Fantasy UI",
          resources: SAVED_ASSET_PACKAGE.resources,
        },
      },
      tree: [{ id: "pack-1" }],
    },
  };
  for (const resourceType of ASSET_PACKAGE_RESOURCE_TYPES) {
    state[resourceType] = { items: {}, tree: [] };
  }
  return state;
};

const BASE_RESOURCES = [
  { resourceType: "images", folderIds: ["image-folder-0"] },
];

const createDeps = () => ({
  appService: {
    getAppCopy: vi.fn(() => EN_I18N.appPage),
    getPayload: vi.fn(() => ({ p: "project-1", ap: "pack-1" })),
    navigate: vi.fn(),
    reportError: vi.fn(),
    saveFilePicker: vi.fn(async () => "/tmp/asset-package.zip"),
    showAlert: vi.fn(),
    showProgressDialog: vi.fn(() => ({
      close: vi.fn(),
      update: vi.fn(),
      waitForPaint: vi.fn(async () => {}),
    })),
    showToast: vi.fn(),
    writeFile: vi.fn(async (path) => path),
  },
  i18n: EN_I18N,
  projectService: {
    getRepositoryState: vi.fn(createRepositoryState),
    createAssetPackageBundle: vi.fn(
      async () => new Blob(["asset-package"], { type: "application/zip" }),
    ),
    updateAssetPackResources: vi.fn(async () => ({ valid: true })),
  },
  refs: {},
  render: vi.fn(),
  store: {
    selectAssetPackageData: vi.fn(() => ({
      repository: ASSET_PACKAGE_REPOSITORY,
      dependencies: {},
    })),
    selectAssetPackage: vi.fn(() => SAVED_ASSET_PACKAGE),
    selectBaseResources: vi.fn(() => BASE_RESOURCES),
    selectIsSavingPicks: vi.fn(() => false),
    startSavingPicks: vi.fn(),
    finishSavingPicks: vi.fn(),
    selectAssetPackId: vi.fn(() => "pack-1"),
    selectAssetPackName: vi.fn(() => "Fantasy UI"),
    setAssetPack: vi.fn(),
    setFilesData: vi.fn(),
    setScenesData: vi.fn(),
    setAssetPackage: vi.fn(),
    setResourceData: vi.fn(),
    setUiConfig: vi.fn(),
    closePicker: vi.fn(),
    openPicker: vi.fn(),
    toggleFolder: vi.fn(),
    applyPicker: vi.fn(),
    setPickerResourceType: vi.fn(),
  },
  uiConfig: { id: "desktop" },
});

describe("asset package handlers", () => {
  it("loads every supported resource collection before mount", () => {
    const deps = createDeps();
    const repositoryState = deps.projectService.getRepositoryState();
    deps.projectService.getRepositoryState.mockReturnValue(repositoryState);

    handleBeforeMount(deps);

    expect(deps.store.setUiConfig).toHaveBeenCalledWith({
      uiConfig: { id: "desktop" },
    });
    expect(deps.store.setFilesData).toHaveBeenCalledWith({
      filesData: repositoryState.files,
    });
    // The scenes name the story links.
    expect(deps.store.setScenesData).toHaveBeenCalledWith({
      scenesData: repositoryState.scenes,
    });
    expect(deps.store.setResourceData).toHaveBeenCalledWith({
      resourceDataByType: Object.fromEntries(
        ASSET_PACKAGE_RESOURCE_TYPES.map((resourceType) => [
          resourceType,
          repositoryState[resourceType],
        ]),
      ),
    });
    // The address names the asset pack to edit.
    expect(deps.store.setAssetPack).toHaveBeenCalledWith({
      assetPackId: "pack-1",
      name: "Fantasy UI",
      resources: SAVED_ASSET_PACKAGE.resources,
    });
  });

  it("goes back to the list when the address names no asset pack", () => {
    const deps = createDeps();
    handleAfterMount(deps);
    expect(deps.appService.navigate).not.toHaveBeenCalled();

    deps.store.selectAssetPackId.mockReturnValue(undefined);
    handleAfterMount(deps);
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: "Could not load the asset package. Please try again.",
      status: "error",
    });
    expect(deps.appService.navigate).toHaveBeenCalledWith(
      "/project/asset-packs",
      { p: "project-1" },
      { historyMode: "replace" },
    );
  });

  it("goes back to the asset pack list", () => {
    const deps = createDeps();
    handleBackClick(deps);
    expect(deps.appService.navigate).toHaveBeenCalledWith(
      "/project/asset-packs",
      { p: "project-1" },
      { historyMode: "replace" },
    );
  });

  const folderEvent = (detail) => ({
    _event: {
      currentTarget: {
        dataset: { resourceType: "images", folderId: "image-folder-1" },
      },
      detail,
    },
  });

  it("ticks or unticks a folder from its box without saving", () => {
    const deps = createDeps();

    handlePickerFolderClick(deps, folderEvent());
    handlePickerFolderClick(deps, folderEvent());

    expect(deps.store.toggleFolder).toHaveBeenCalledTimes(2);
    expect(deps.store.toggleFolder).toHaveBeenCalledWith({
      resourceType: "images",
      folderId: "image-folder-1",
    });
    expect(deps.projectService.updateAssetPackResources).not.toHaveBeenCalled();
    expect(deps.render).toHaveBeenCalledTimes(2);
  });

  it("applies the picker's ticks and saves what changed since the picks it started from on Done", async () => {
    const deps = createDeps();

    await handlePickerDoneClick(deps);

    expect(deps.store.applyPicker).toHaveBeenCalledOnce();
    expect(deps.store.closePicker).not.toHaveBeenCalled();
    expect(deps.store.startSavingPicks).toHaveBeenCalledOnce();
    expect(deps.projectService.updateAssetPackResources).toHaveBeenCalledWith({
      assetPackId: "pack-1",
      baseResources: BASE_RESOURCES,
      resources: SAVED_ASSET_PACKAGE.resources,
    });
    // The next save starts from what this one saved.
    expect(deps.store.finishSavingPicks).toHaveBeenCalledWith({
      savedResources: SAVED_ASSET_PACKAGE.resources,
    });
    // Once as the save starts, once as it ends.
    expect(deps.render).toHaveBeenCalledTimes(2);
    expect(deps.store.setAssetPack).not.toHaveBeenCalled();
    expect(deps.appService.showAlert).not.toHaveBeenCalled();
  });

  it("ignores Done while the picks save", async () => {
    const deps = createDeps();
    let resolveSave;
    deps.projectService.updateAssetPackResources.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );
    deps.store.startSavingPicks.mockImplementation(() => {
      deps.store.selectIsSavingPicks.mockReturnValue(true);
    });
    deps.store.finishSavingPicks.mockImplementation(() => {
      deps.store.selectIsSavingPicks.mockReturnValue(false);
    });

    const firstDone = handlePickerDoneClick(deps);
    await handlePickerDoneClick(deps);
    expect(deps.store.applyPicker).toHaveBeenCalledOnce();
    expect(deps.projectService.updateAssetPackResources).toHaveBeenCalledOnce();

    resolveSave({ valid: true });
    await firstDone;
    expect(deps.store.finishSavingPicks).toHaveBeenCalledOnce();
    // Once the save ends, Done saves again.
    deps.projectService.updateAssetPackResources.mockResolvedValue({
      valid: true,
    });
    await handlePickerDoneClick(deps);
    expect(deps.store.applyPicker).toHaveBeenCalledTimes(2);
  });

  it("goes back to the saved picks and says why in an alert when they cannot be saved", async () => {
    const deps = createDeps();
    deps.projectService.updateAssetPackResources.mockResolvedValue({
      valid: false,
      error: { message: "Storage unavailable" },
    });

    await handlePickerDoneClick(deps);

    expect(deps.store.setAssetPack).toHaveBeenCalledWith({
      assetPackId: "pack-1",
      name: "Fantasy UI",
      resources: SAVED_ASSET_PACKAGE.resources,
    });
    expect(deps.store.finishSavingPicks).toHaveBeenCalledWith();
    expect(deps.render).toHaveBeenCalledTimes(2);
    expect(deps.appService.showToast).not.toHaveBeenCalled();
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      title: "Error",
      message:
        "Could not save the asset package. Please try again.\n\nDetails:\nStorage unavailable",
    });
  });

  it("reports a save that throws, and says why in an alert", async () => {
    const deps = createDeps();
    const error = new Error("Disk is gone");
    deps.projectService.updateAssetPackResources.mockRejectedValue(error);

    await handlePickerDoneClick(deps);

    expect(deps.appService.reportError).toHaveBeenCalledWith(
      error,
      expect.any(Object),
    );
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      title: "Error",
      message:
        "Could not save the asset package. Please try again.\n\nDetails:\nDisk is gone",
    });
    expect(deps.store.setAssetPack).toHaveBeenCalledOnce();
    expect(deps.store.finishSavingPicks).toHaveBeenCalledWith();
  });

  it("opens the folder picker, and closes it without saving", () => {
    const deps = createDeps();

    handlePickResourcesClick(deps);
    handlePickerClose(deps);

    expect(deps.store.openPicker).toHaveBeenCalledOnce();
    expect(deps.store.closePicker).toHaveBeenCalledOnce();
    expect(deps.store.applyPicker).not.toHaveBeenCalled();
    expect(deps.projectService.updateAssetPackResources).not.toHaveBeenCalled();
    expect(deps.render).toHaveBeenCalledTimes(2);
  });

  it("switches the picker's type without saving", () => {
    const deps = createDeps();

    handlePickerTypeClick(deps, folderEvent());

    expect(deps.store.setPickerResourceType).toHaveBeenCalledWith({
      resourceType: "images",
    });
    expect(deps.projectService.updateAssetPackResources).not.toHaveBeenCalled();
    expect(deps.render).toHaveBeenCalledOnce();
  });

  it("chooses the path before exporting and reports completion", async () => {
    const deps = createDeps();

    await handleDownloadAssetPackageButtonClick(deps);

    expect(deps.appService.saveFilePicker).toHaveBeenCalledWith({
      title: "Save asset package",
      defaultPath: "Fantasy UI.zip",
      filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
    });
    expect(
      deps.appService.saveFilePicker.mock.invocationCallOrder[0],
    ).toBeLessThan(
      deps.projectService.createAssetPackageBundle.mock.invocationCallOrder[0],
    );
    const progressDialog =
      deps.appService.showProgressDialog.mock.results[0].value;
    expect(deps.appService.showProgressDialog).toHaveBeenCalledWith({
      title: "Asset package export in progress",
      message: "Please wait while the asset package is being created...",
      status: "Generating previews and package files...",
      progress: {},
    });
    expect(progressDialog.waitForPaint).toHaveBeenCalledOnce();
    expect(deps.projectService.createAssetPackageBundle).toHaveBeenCalledWith({
      manifest: {
        schema: "routevn.import-pack.v2",
        package: {
          kind: "routevn.creator.asset-package",
        },
        repository: ASSET_PACKAGE_REPOSITORY,
      },
    });
    const [outputPath, bundle] = deps.appService.writeFile.mock.calls[0];
    expect(outputPath).toBe("/tmp/asset-package.zip");
    expect(bundle.type).toBe("application/zip");
    expect(progressDialog.update).toHaveBeenCalledWith({
      status: "Saving asset package...",
      progress: {},
    });
    expect(progressDialog.close).toHaveBeenCalledOnce();
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      title: "Export completed",
      message:
        "Asset package export completed.\nSaved to: /tmp/asset-package.zip",
    });
  });

  it("does not start exporting when path selection is cancelled", async () => {
    const deps = createDeps();
    deps.appService.saveFilePicker.mockResolvedValue(undefined);

    await handleDownloadAssetPackageButtonClick(deps);

    expect(deps.appService.showProgressDialog).not.toHaveBeenCalled();
    expect(deps.projectService.createAssetPackageBundle).not.toHaveBeenCalled();
    expect(deps.appService.writeFile).not.toHaveBeenCalled();
  });

  it("rejects an empty package before opening the save picker", async () => {
    const deps = createDeps();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    deps.store.selectAssetPackageData.mockReturnValue({
      repository: { files: { items: {} } },
      dependencies: {},
    });

    try {
      await handleDownloadAssetPackageButtonClick(deps);
    } finally {
      consoleError.mockRestore();
    }

    expect(deps.appService.saveFilePicker).not.toHaveBeenCalled();
    expect(deps.projectService.createAssetPackageBundle).not.toHaveBeenCalled();
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: "Add at least one resource before exporting.",
      status: "error",
    });
  });

  it("shows feedback when ZIP creation fails", async () => {
    const deps = createDeps();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    deps.projectService.createAssetPackageBundle.mockRejectedValue(
      new Error("Missing file"),
    );

    try {
      await handleDownloadAssetPackageButtonClick(deps);
      expect(consoleError).toHaveBeenCalledWith(
        "[asset-package] Failed to export asset package.",
        expect.objectContaining({ message: "Missing file" }),
      );
    } finally {
      consoleError.mockRestore();
    }

    const progressDialog =
      deps.appService.showProgressDialog.mock.results[0].value;
    expect(deps.appService.saveFilePicker).toHaveBeenCalledOnce();
    expect(deps.appService.writeFile).not.toHaveBeenCalled();
    expect(progressDialog.close).toHaveBeenCalledOnce();
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: "Could not download the asset package. Please try again.",
      status: "error",
    });
  });
});
