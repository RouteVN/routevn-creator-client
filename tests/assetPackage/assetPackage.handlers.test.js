import { describe, expect, it, vi } from "vitest";
import { ASSET_PACKAGE_RESOURCE_TYPES } from "../../src/internal/assetPackageResources.js";
import {
  handleAddFoldersClick,
  handleAfterMount,
  handleBeforeMount,
  handleDownloadAssetPackageButtonClick,
  handleFolderCheckboxChange,
  handleFolderExpandClick,
  handlePickerClose,
  handleRemoveFolderClick,
  handleResourceTypeHeaderClick,
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
  };
  for (const resourceType of ASSET_PACKAGE_RESOURCE_TYPES) {
    state[resourceType] = { items: {}, tree: [] };
  }
  return state;
};

const createDeps = () => ({
  appService: {
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
    getCurrentAssetPackage: vi.fn(async () => SAVED_ASSET_PACKAGE),
    updateCurrentAssetPackage: vi.fn(async (assetPackage) => assetPackage),
  },
  refs: {},
  render: vi.fn(),
  store: {
    selectAssetPackageData: vi.fn(() => ({
      repository: ASSET_PACKAGE_REPOSITORY,
      dependencies: {},
    })),
    selectAssetPackage: vi.fn(() => SAVED_ASSET_PACKAGE),
    setFilesData: vi.fn(),
    setAssetPackage: vi.fn(),
    setResourceData: vi.fn(),
    setUiConfig: vi.fn(),
    closePicker: vi.fn(),
    openPicker: vi.fn(),
    toggleFolder: vi.fn(),
    toggleFolderExpanded: vi.fn(),
    toggleResourceTypeCollapsed: vi.fn(),
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
    expect(deps.store.setResourceData).toHaveBeenCalledWith({
      resourceDataByType: Object.fromEntries(
        ASSET_PACKAGE_RESOURCE_TYPES.map((resourceType) => [
          resourceType,
          repositoryState[resourceType],
        ]),
      ),
    });
  });

  it("loads the saved project asset package after mount", async () => {
    const deps = createDeps();

    await handleAfterMount(deps);

    expect(deps.projectService.getCurrentAssetPackage).toHaveBeenCalledOnce();
    expect(deps.store.setAssetPackage).toHaveBeenCalledWith({
      assetPackage: SAVED_ASSET_PACKAGE,
    });
    expect(deps.render).toHaveBeenCalledOnce();
  });

  it("shows feedback when the saved asset package cannot be loaded", async () => {
    const deps = createDeps();
    deps.projectService.getCurrentAssetPackage.mockRejectedValue(
      new Error("Storage unavailable"),
    );

    await handleAfterMount(deps);

    expect(deps.store.setAssetPackage).not.toHaveBeenCalled();
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: "Could not load the asset package. Please try again.",
      status: "error",
    });
  });

  const folderEvent = (detail) => ({
    _event: {
      currentTarget: {
        dataset: { resourceType: "images", folderId: "image-folder-1" },
      },
      detail,
    },
  });

  it("ticks a folder and saves the selection at once", async () => {
    const deps = createDeps();

    await handleFolderCheckboxChange(deps, folderEvent({ value: true }));
    await handleFolderCheckboxChange(deps, folderEvent({ value: false }));

    expect(deps.store.toggleFolder).toHaveBeenNthCalledWith(1, {
      resourceType: "images",
      folderId: "image-folder-1",
      selected: true,
    });
    expect(deps.store.toggleFolder).toHaveBeenNthCalledWith(2, {
      resourceType: "images",
      folderId: "image-folder-1",
      selected: false,
    });
    expect(deps.projectService.updateCurrentAssetPackage).toHaveBeenCalledWith(
      SAVED_ASSET_PACKAGE,
    );
    expect(deps.render).toHaveBeenCalledTimes(2);
  });

  it("shows feedback when the asset package cannot be saved", async () => {
    const deps = createDeps();
    deps.projectService.updateCurrentAssetPackage.mockRejectedValue(
      new Error("Storage unavailable"),
    );

    await handleFolderCheckboxChange(deps, folderEvent({ value: true }));

    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: "Could not save the asset package. Please try again.",
      status: "error",
    });
  });

  it("removes a picked folder and saves the selection", async () => {
    const deps = createDeps();

    await handleRemoveFolderClick(deps, folderEvent());

    expect(deps.store.toggleFolder).toHaveBeenCalledWith({
      resourceType: "images",
      folderId: "image-folder-1",
      selected: false,
    });
    expect(deps.projectService.updateCurrentAssetPackage).toHaveBeenCalledWith(
      SAVED_ASSET_PACKAGE,
    );
  });

  it("opens and closes the folder picker", () => {
    const deps = createDeps();

    handleAddFoldersClick(deps);
    handlePickerClose(deps);

    expect(deps.store.openPicker).toHaveBeenCalledOnce();
    expect(deps.store.closePicker).toHaveBeenCalledOnce();
    expect(deps.render).toHaveBeenCalledTimes(2);
  });

  it("expands a folder in the picker on its own", () => {
    const deps = createDeps();
    const event = folderEvent();
    event._event.currentTarget.dataset.picker = "true";

    handleFolderExpandClick(deps, event);

    expect(deps.store.toggleFolderExpanded).toHaveBeenCalledWith({
      resourceType: "images",
      folderId: "image-folder-1",
      inPicker: true,
    });
  });

  it("expands a folder and collapses a type without saving", () => {
    const deps = createDeps();

    handleFolderExpandClick(deps, folderEvent());
    handleResourceTypeHeaderClick(deps, folderEvent());

    expect(deps.store.toggleFolderExpanded).toHaveBeenCalledWith({
      resourceType: "images",
      folderId: "image-folder-1",
      inPicker: false,
    });
    expect(deps.store.toggleResourceTypeCollapsed).toHaveBeenCalledWith({
      resourceType: "images",
    });
    expect(
      deps.projectService.updateCurrentAssetPackage,
    ).not.toHaveBeenCalled();
    expect(deps.render).toHaveBeenCalledTimes(2);
  });

  it("chooses the path before exporting and reports completion", async () => {
    const deps = createDeps();

    await handleDownloadAssetPackageButtonClick(deps);

    expect(deps.appService.saveFilePicker).toHaveBeenCalledWith({
      title: "Save asset package",
      defaultPath: "asset-package.zip",
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
