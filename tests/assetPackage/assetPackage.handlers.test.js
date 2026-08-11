import { describe, expect, it, vi } from "vitest";
import { ASSET_PACKAGE_RESOURCE_TYPES } from "../../src/internal/assetPackageResources.js";
import {
  handleAddResourceTypeButtonClick,
  handleAfterMount,
  handleBeforeMount,
  handleConfirmResourceFolders,
  handleDownloadAssetPackageButtonClick,
  handleEditResourceFoldersButtonClick,
  handlePackageMetadataDetailClick,
  handlePackageMetadataEditDialogClose,
  handlePackageMetadataEditFormAction,
  handleResourceFolderOptionClick,
  handleResourceFolderPickerClose,
  handleResourceTypeContextMenuClose,
  handleResourceTypeContextMenuItemClick,
  handleResourceTypeHeadingContextMenu,
  handleResourceTypeMenuItemClick,
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

const PACKAGE_METADATA = {
  id: "placeholder.asset-package",
  name: "Placeholder Asset Package",
  version: "1.0.0",
  description: "Placeholder asset package description.",
};

const SAVED_ASSET_PACKAGE = {
  schemaVersion: 1,
  metadata: PACKAGE_METADATA,
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
  refs: {
    packageMetadataEditForm: {
      reset: vi.fn(),
      setValues: vi.fn(),
    },
  },
  render: vi.fn(),
  store: {
    closeResourceFolderPicker: vi.fn(),
    closeResourceTypeContextMenu: vi.fn(),
    closeResourceTypeMenu: vi.fn(),
    confirmResourceFolderSelection: vi.fn(),
    openResourceFolderPicker: vi.fn(),
    openResourceTypeContextMenu: vi.fn(),
    openResourceTypeMenu: vi.fn(),
    moveResourceType: vi.fn(),
    openPackageMetadataEditDialog: vi.fn(),
    closePackageMetadataEditDialog: vi.fn(),
    selectResourceTypeContextMenuResourceType: vi.fn(() => "sounds"),
    selectResourceTypeMenuPosition: vi.fn(() => ({ x: 20, y: 60 })),
    selectAssetPackageData: vi.fn(() => ASSET_PACKAGE_REPOSITORY),
    selectAssetPackage: vi.fn(() => SAVED_ASSET_PACKAGE),
    selectPackageMetadata: vi.fn(() => PACKAGE_METADATA),
    selectPackageMetadataEditDefaultValues: vi.fn(() => PACKAGE_METADATA),
    setPackageMetadata: vi.fn(),
    setFilesData: vi.fn(),
    setAssetPackage: vi.fn(),
    setResourceData: vi.fn(),
    setUiConfig: vi.fn(),
    toggleResourceFolderSelection: vi.fn(),
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

  it("opens the menu and generic folder picker for any resource type", () => {
    const deps = createDeps();
    const buttonPayload = {
      _event: {
        currentTarget: {
          dataset: { resourceType: "textStyles" },
          getBoundingClientRect: () => ({ left: 20, bottom: 60 }),
        },
      },
    };

    handleAddResourceTypeButtonClick(deps, buttonPayload);
    handleResourceTypeMenuItemClick(deps, {
      _event: { detail: { item: { value: "particles" } } },
    });
    handleEditResourceFoldersButtonClick(deps, buttonPayload);

    expect(deps.store.openResourceTypeMenu).toHaveBeenCalledWith({
      x: 20,
      y: 60,
    });
    expect(deps.store.openResourceFolderPicker).toHaveBeenNthCalledWith(1, {
      resourceType: "particles",
      x: 20,
      y: 60,
    });
    expect(deps.store.openResourceFolderPicker).toHaveBeenNthCalledWith(2, {
      resourceType: "textStyles",
      x: 20,
      y: 60,
    });
  });

  it("toggles, confirms, persists, and closes generic folder selection", async () => {
    const deps = createDeps();

    handleResourceFolderOptionClick(deps, {
      _event: { currentTarget: { dataset: { folderId: "folder-1" } } },
    });
    await handleConfirmResourceFolders(deps);
    handleResourceFolderPickerClose(deps);

    expect(deps.store.toggleResourceFolderSelection).toHaveBeenCalledWith({
      folderId: "folder-1",
    });
    expect(deps.store.confirmResourceFolderSelection).toHaveBeenCalledOnce();
    expect(deps.projectService.updateCurrentAssetPackage).toHaveBeenCalledWith(
      SAVED_ASSET_PACKAGE,
    );
    expect(deps.store.closeResourceFolderPicker).toHaveBeenCalledOnce();
    expect(deps.render).toHaveBeenCalledTimes(3);
  });

  it("shows feedback when the asset package cannot be saved", async () => {
    const deps = createDeps();
    deps.projectService.updateCurrentAssetPackage.mockRejectedValue(
      new Error("Storage unavailable"),
    );

    await handleConfirmResourceFolders(deps);

    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: "Could not save the asset package. Please try again.",
      status: "error",
    });
  });

  it("opens the resource type context menu and persists the moved section", async () => {
    const deps = createDeps();
    const preventDefault = vi.fn();

    handleResourceTypeHeadingContextMenu(deps, {
      _event: {
        currentTarget: { dataset: { resourceType: "sounds" } },
        clientX: 30,
        clientY: 40,
        preventDefault,
      },
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(deps.store.openResourceTypeContextMenu).toHaveBeenCalledWith({
      resourceType: "sounds",
      x: 30,
      y: 40,
    });

    await handleResourceTypeContextMenuItemClick(deps, {
      _event: { detail: { item: { value: "move-up" } } },
    });
    expect(deps.store.closeResourceTypeContextMenu).toHaveBeenCalledOnce();
    expect(deps.store.moveResourceType).toHaveBeenCalledWith({
      resourceType: "sounds",
      offset: -1,
    });
    expect(deps.projectService.updateCurrentAssetPackage).toHaveBeenCalledWith(
      SAVED_ASSET_PACKAGE,
    );

    handleResourceTypeContextMenuClose(deps);
    expect(deps.store.closeResourceTypeContextMenu).toHaveBeenCalledTimes(2);
    expect(deps.render).toHaveBeenCalledTimes(3);
  });

  it("edits validated package information and persists it", async () => {
    const deps = createDeps();
    const packageMetadata = {
      id: "example.updated-package",
      name: "Updated Package",
      version: "2.0.0",
      description: "Updated resources.",
    };

    handlePackageMetadataDetailClick(deps);
    expect(deps.store.openPackageMetadataEditDialog).toHaveBeenCalledOnce();
    expect(deps.refs.packageMetadataEditForm.reset).toHaveBeenCalledOnce();
    expect(deps.refs.packageMetadataEditForm.setValues).toHaveBeenCalledWith({
      values: PACKAGE_METADATA,
    });

    await handlePackageMetadataEditFormAction(deps, {
      _event: { detail: { actionId: "submit", values: packageMetadata } },
    });
    expect(deps.store.setPackageMetadata).toHaveBeenCalledWith({
      packageMetadata,
    });
    expect(
      deps.projectService.updateCurrentAssetPackage,
    ).toHaveBeenCalledOnce();
    expect(deps.store.closePackageMetadataEditDialog).toHaveBeenCalledOnce();

    handlePackageMetadataEditDialogClose(deps);
    expect(deps.store.closePackageMetadataEditDialog).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid package information without persisting it", async () => {
    const deps = createDeps();

    await handlePackageMetadataEditFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: { ...PACKAGE_METADATA, version: "not-a-version" },
        },
      },
    });

    expect(deps.store.setPackageMetadata).not.toHaveBeenCalled();
    expect(
      deps.projectService.updateCurrentAssetPackage,
    ).not.toHaveBeenCalled();
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: "Enter a valid package ID, name, and semantic version.",
      status: "error",
    });
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
        schema: "routevn.import-pack.v1",
        package: {
          kind: "routevn.creator.asset-package",
          ...PACKAGE_METADATA,
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
    deps.store.selectAssetPackageData.mockReturnValue({ files: { items: {} } });

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

  it("requires package information before opening the save picker", async () => {
    const deps = createDeps();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const emptyPackageMetadata = {
      id: "",
      name: "",
      version: "",
      description: "",
    };
    deps.store.selectPackageMetadata.mockReturnValue(emptyPackageMetadata);
    deps.store.selectPackageMetadataEditDefaultValues.mockReturnValue(
      emptyPackageMetadata,
    );

    try {
      await handleDownloadAssetPackageButtonClick(deps);
    } finally {
      consoleError.mockRestore();
    }

    expect(deps.appService.saveFilePicker).not.toHaveBeenCalled();
    expect(deps.store.openPackageMetadataEditDialog).toHaveBeenCalledOnce();
    expect(deps.refs.packageMetadataEditForm.reset).toHaveBeenCalledOnce();
    expect(deps.refs.packageMetadataEditForm.setValues).toHaveBeenCalledWith({
      values: emptyPackageMetadata,
    });
    expect(deps.render).toHaveBeenCalledOnce();
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: "Complete the package information before exporting.",
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
