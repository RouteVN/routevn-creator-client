import { afterEach, describe, expect, it, vi } from "vitest";
import { EN_I18N } from "../support/i18n.js";
import {
  handleImportFormActionClick,
  handleImportTransformClick,
  handleTransformPreviewImageContextMenu,
  handleTransformPreviewImageMenuItemClick,
  handleTransformPreviewImageSelected,
} from "../../src/pages/transforms/transforms.handlers.js";

const originalFetch = globalThis.fetch;

describe("transforms.handlers", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("opens transform import as a global page action", () => {
    const render = vi.fn();
    const store = {
      openImportDialog: vi.fn(),
    };

    handleImportTransformClick({ render, store });

    expect(store.openImportDialog).toHaveBeenCalledWith();
    expect(render).toHaveBeenCalled();
  });

  it("imports one transform into the selected destination folder", async () => {
    let createdTransform;
    const importInput = {
      type: "transform",
      name: "Imported Center",
      x: 960,
      y: 540,
      scaleX: 1.2,
      scaleY: 1.3,
      anchorX: 0.5,
      anchorY: 0.5,
      rotation: 15,
    };
    const appService = {
      showAlert: vi.fn(),
      showToast: vi.fn(),
    };
    const render = vi.fn();
    const store = {
      closeImportDialog: vi.fn(),
      selectImportDialogPendingInput: vi.fn(() => importInput),
      selectImportDialogTargetGroupId: vi.fn(() => undefined),
      selectImportDialogImageFolderId: vi.fn(() => undefined),
      setImportDestinationValues: vi.fn(),
      setSearchQuery: vi.fn(),
      setActiveTagIds: vi.fn(),
      setImagesData: vi.fn(),
      setItems: vi.fn(),
      setProjectResolution: vi.fn(),
      setSelectedFolderId: vi.fn(),
      setSelectedItemId: vi.fn(),
      setTagsData: vi.fn(),
    };
    const projectService = {
      createTransform: vi.fn(async (input) => {
        createdTransform = input;
        return input.transformId;
      }),
      importImageFile: vi.fn(),
      getRepositoryState: vi.fn(() => ({
        images: { items: {}, tree: [] },
        project: {},
        tags: {},
        transforms: {
          items: {
            [createdTransform.transformId]: {
              id: createdTransform.transformId,
              ...createdTransform.data,
            },
          },
          tree: [{ id: createdTransform.transformId }],
        },
      })),
    };
    const refs = {
      fileExplorer: {
        selectItem: vi.fn(),
      },
    };

    await handleImportFormActionClick(
      {
        i18n: EN_I18N,
        appService,
        projectService,
        refs,
        render,
        store,
      },
      {
        _event: {
          detail: {
            actionId: "import",
            valid: true,
            values: {
              transformFolderId: "folder-1",
            },
          },
        },
      },
    );

    expect(store.setImportDestinationValues).toHaveBeenCalledWith({
      values: {
        transformFolderId: "folder-1",
      },
    });
    expect(projectService.createTransform).toHaveBeenCalledWith({
      transformId: expect.any(String),
      data: {
        type: "transform",
        name: "Imported Center",
        description: "",
        x: 960,
        y: 540,
        scaleX: 1.2,
        scaleY: 1.3,
        anchorX: 0.5,
        anchorY: 0.5,
        rotation: 15,
      },
      parentId: "folder-1",
      position: "last",
    });
    expect(store.closeImportDialog).toHaveBeenCalled();
    expect(appService.showToast).toHaveBeenCalledWith({
      message: "Transform imported.",
    });
    expect(store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: createdTransform.transformId,
    });
    expect(refs.fileExplorer.selectItem).toHaveBeenCalledWith({
      itemId: createdTransform.transformId,
    });
  });

  it("shows an alert when the form reports validation errors", async () => {
    const appService = {
      showAlert: vi.fn(),
      showToast: vi.fn(),
    };
    const projectService = {
      createTransform: vi.fn(),
    };

    await handleImportFormActionClick(
      {
        i18n: EN_I18N,
        appService,
        projectService,
        render: vi.fn(),
        store: {},
      },
      {
        _event: {
          detail: {
            actionId: "continue",
            valid: false,
            values: {},
          },
        },
      },
    );

    expect(projectService.createTransform).not.toHaveBeenCalled();
    expect(appService.showAlert).toHaveBeenCalledWith({
      message: "Import URL is required.",
      title: "Error",
    });
    expect(appService.showToast).not.toHaveBeenCalled();
  });

  it("shows an alert when the import URL is invalid", async () => {
    const appService = {
      showAlert: vi.fn(),
      showToast: vi.fn(),
    };
    globalThis.fetch = vi.fn();

    await handleImportFormActionClick(
      {
        i18n: EN_I18N,
        appService,
        projectService: {},
        refs: {},
        render: vi.fn(),
        store: {},
      },
      {
        _event: {
          detail: {
            actionId: "continue",
            valid: true,
            values: {
              url: "/public/import-transform-sample.json",
            },
          },
        },
      },
    );

    expect(appService.showAlert).toHaveBeenCalledWith({
      message: EN_I18N.transformsPage.invalidImportUrl,
      title: "Error",
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("shows an alert when the import URL content is not JSON", async () => {
    const appService = {
      showAlert: vi.fn(),
      showToast: vi.fn(),
    };
    const store = {
      openImportDestinationStep: vi.fn(),
    };
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      headers: {
        get: vi.fn(() => "text/html"),
      },
      json: vi.fn(),
    }));

    await handleImportFormActionClick(
      {
        i18n: EN_I18N,
        appService,
        projectService: {},
        refs: {},
        render: vi.fn(),
        store,
      },
      {
        _event: {
          detail: {
            actionId: "continue",
            valid: true,
            values: {
              url: "https://example.com/import-transform-sample.json",
            },
          },
        },
      },
    );

    expect(appService.showAlert).toHaveBeenCalledWith({
      message: "Import URL must return JSON.",
      title: "Error",
    });
    expect(store.openImportDestinationStep).not.toHaveBeenCalled();
  });

  it("shows an alert when transform image dependencies have invalid file URLs", async () => {
    const appService = {
      showAlert: vi.fn(),
      showToast: vi.fn(),
    };
    const store = {
      openImportDestinationStep: vi.fn(),
    };
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      headers: {
        get: vi.fn(() => "application/json"),
      },
      json: vi.fn(async () => ({
        schema: "routevn.import-pack.v1",
        primary: {
          resourceType: "transforms",
          id: "transform.primary",
        },
        repository: {
          transforms: {
            items: {
              "transform.primary": {
                id: "transform.primary",
                type: "transform",
                name: "Primary Transform",
                preview: {
                  target: {
                    imageId: "image.primary",
                  },
                },
              },
            },
          },
          images: {
            items: {
              "image.primary": {
                id: "image.primary",
                type: "image",
                name: "Primary Image",
                fileId: "file.primary",
              },
            },
          },
        },
        files: {
          "file.primary": {
            url: "/image.png",
          },
        },
      })),
    }));

    await handleImportFormActionClick(
      {
        i18n: EN_I18N,
        appService,
        projectService: {},
        refs: {},
        render: vi.fn(),
        store,
      },
      {
        _event: {
          detail: {
            actionId: "continue",
            valid: true,
            values: {
              url: "https://example.com/import-transform-sample.json",
            },
          },
        },
      },
    );

    expect(appService.showAlert).toHaveBeenCalledWith({
      message: 'Image dependency "Primary Image" has an invalid file URL.',
      title: "Error",
    });
    expect(store.openImportDestinationStep).not.toHaveBeenCalled();
  });

  it("continues to folder selection after parsing a valid package", async () => {
    const appService = {
      showAlert: vi.fn(),
      showToast: vi.fn(),
    };
    const store = {
      openImportDestinationStep: vi.fn(),
    };
    const importInput = {
      schema: "routevn.import-pack.v1",
      primary: {
        resourceType: "transforms",
        id: "transform.primary",
      },
      repository: {
        transforms: {
          items: {
            "transform.primary": {
              id: "transform.primary",
              type: "transform",
              name: "Primary Transform",
            },
          },
        },
        images: {
          items: {
            "image.primary": {
              id: "image.primary",
              type: "image",
              name: "Primary Image",
              fileId: "file.primary",
            },
          },
        },
      },
      files: {
        "file.primary": {
          url: "https://example.com/image.png",
          mimeType: "image/png",
        },
      },
    };
    const values = {
      url: "http://localhost:3001/public/import-transform-sample.json",
    };
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: vi.fn(async () => importInput),
    }));

    await handleImportFormActionClick(
      {
        i18n: EN_I18N,
        appService,
        projectService: {},
        refs: {},
        render: vi.fn(),
        store,
      },
      {
        _event: {
          detail: {
            actionId: "continue",
            valid: true,
            values,
          },
        },
      },
    );

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3001/public/import-transform-sample.json",
      {
        headers: {
          Accept: "application/json",
        },
      },
    );
    expect(store.openImportDestinationStep).toHaveBeenCalledWith({
      importInput,
      sourceValues: values,
      includeImages: false,
    });
  });

  it("imports the primary transform from a package", async () => {
    let createdTransform;
    const importInput = {
      schema: "routevn.import-pack.v1",
      primary: {
        resourceType: "transforms",
        id: "transform.primary",
      },
      repository: {
        transforms: {
          items: {
            "transform.other": {
              id: "transform.other",
              type: "transform",
              name: "Other Transform",
            },
            "transform.primary": {
              id: "transform.primary",
              type: "transform",
              name: "Primary Transform",
              x: 320,
              y: 180,
            },
          },
        },
        images: {
          items: {
            "image.unused": {
              id: "image.unused",
              type: "image",
              name: "Unused Image",
              fileId: "file.unused",
            },
          },
        },
      },
      files: {
        "file.unused": {
          url: "/unused.png",
        },
      },
    };
    const appService = {
      showAlert: vi.fn(),
      showToast: vi.fn(),
    };
    const store = {
      closeImportDialog: vi.fn(),
      selectImportDialogPendingInput: vi.fn(() => importInput),
      selectImportDialogTargetGroupId: vi.fn(() => undefined),
      selectImportDialogImageFolderId: vi.fn(() => undefined),
      setImportDestinationValues: vi.fn(),
      setSearchQuery: vi.fn(),
      setActiveTagIds: vi.fn(),
      setImagesData: vi.fn(),
      setItems: vi.fn(),
      setProjectResolution: vi.fn(),
      setSelectedFolderId: vi.fn(),
      setSelectedItemId: vi.fn(),
      setTagsData: vi.fn(),
    };
    const projectService = {
      createTransform: vi.fn(async (input) => {
        createdTransform = input;
        return input.transformId;
      }),
      importImageFile: vi.fn(),
      getRepositoryState: vi.fn(() => ({
        images: { items: {}, tree: [] },
        project: {},
        tags: {},
        transforms: {
          items: {
            [createdTransform.transformId]: {
              id: createdTransform.transformId,
              ...createdTransform.data,
            },
          },
          tree: [{ id: createdTransform.transformId }],
        },
      })),
    };

    await handleImportFormActionClick(
      {
        i18n: EN_I18N,
        appService,
        projectService,
        refs: {},
        render: vi.fn(),
        store,
      },
      {
        _event: {
          detail: {
            actionId: "import",
            valid: true,
            values: {
              transformFolderId: "_root",
            },
          },
        },
      },
    );

    expect(projectService.createTransform).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Primary Transform",
          x: 320,
          y: 180,
        }),
        parentId: undefined,
      }),
    );
    expect(projectService.importImageFile).not.toHaveBeenCalled();
    expect(store.closeImportDialog).toHaveBeenCalled();
    expect(store.setSearchQuery).toHaveBeenCalledWith({ value: "" });
    expect(store.setActiveTagIds).toHaveBeenCalledWith({ tagIds: [] });
  });

  it("imports only preview-referenced transform image dependencies", async () => {
    let createdTransform;
    const importInput = {
      schema: "routevn.import-pack.v1",
      primary: {
        resourceType: "transforms",
        id: "transform.primary",
      },
      repository: {
        transforms: {
          items: {
            "transform.primary": {
              id: "transform.primary",
              type: "transform",
              name: "Primary Transform",
              preview: {
                target: {
                  imageId: "image.primary",
                  slot: "target",
                },
              },
            },
          },
        },
        images: {
          items: {
            "image.primary": {
              id: "image.primary",
              type: "image",
              name: "Primary Image",
              fileId: "file.primary",
            },
            "image.unused": {
              id: "image.unused",
              type: "image",
              name: "Unused Image",
              fileId: "file.unused",
            },
          },
        },
      },
      files: {
        "file.primary": {
          url: "https://example.com/primary.png",
          mimeType: "image/png",
        },
        "file.unused": {
          url: "/unused.png",
        },
      },
    };
    const appService = {
      showAlert: vi.fn(),
      showToast: vi.fn(),
    };
    const store = {
      closeImportDialog: vi.fn(),
      selectImportDialogPendingInput: vi.fn(() => importInput),
      selectImportDialogTargetGroupId: vi.fn(() => undefined),
      selectImportDialogImageFolderId: vi.fn(() => undefined),
      setImportDestinationValues: vi.fn(),
      setSearchQuery: vi.fn(),
      setActiveTagIds: vi.fn(),
      setImagesData: vi.fn(),
      setItems: vi.fn(),
      setProjectResolution: vi.fn(),
      setSelectedFolderId: vi.fn(),
      setSelectedItemId: vi.fn(),
      setTagsData: vi.fn(),
    };
    const projectService = {
      createTransform: vi.fn(async (input) => {
        createdTransform = input;
        return input.transformId;
      }),
      importImageFile: vi.fn(async () => ({
        imageId: "image.imported",
      })),
      getRepositoryState: vi.fn(() => ({
        images: { items: {}, tree: [] },
        project: {},
        tags: {},
        transforms: {
          items: {
            [createdTransform.transformId]: {
              id: createdTransform.transformId,
              ...createdTransform.data,
            },
          },
          tree: [{ id: createdTransform.transformId }],
        },
      })),
    };
    globalThis.fetch = vi.fn(async (url) => {
      if (url === "https://example.com/primary.png") {
        return {
          ok: true,
          blob: vi.fn(async () => new Blob(["primary"], { type: "image/png" })),
        };
      }

      return {
        ok: false,
        blob: vi.fn(),
      };
    });

    await handleImportFormActionClick(
      {
        i18n: EN_I18N,
        appService,
        projectService,
        refs: {},
        render: vi.fn(),
        store,
      },
      {
        _event: {
          detail: {
            actionId: "import",
            valid: true,
            values: {
              imageFolderId: "images-folder",
              transformFolderId: "transforms-folder",
            },
          },
        },
      },
    );

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://example.com/primary.png",
    );
    expect(projectService.importImageFile).toHaveBeenCalledTimes(1);
    expect(projectService.importImageFile).toHaveBeenCalledWith({
      file: expect.any(Blob),
      imageId: expect.any(String),
      parentId: "images-folder",
    });
    expect(projectService.createTransform).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          preview: {
            target: {
              imageId: "image.imported",
              slot: "target",
            },
          },
        }),
        parentId: "transforms-folder",
      }),
    );
    expect(appService.showAlert).not.toHaveBeenCalled();
  });

  it("opens the preview image context menu from the target slot", () => {
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const store = {
      openPreviewImageMenu: vi.fn(),
    };
    const render = vi.fn();

    handleTransformPreviewImageContextMenu(
      {
        i18n: EN_I18N,
        render,
        store,
      },
      {
        _event: {
          clientX: 64,
          clientY: 96,
          currentTarget: {
            dataset: {
              target: "preview-target",
            },
          },
          preventDefault,
          stopPropagation,
        },
      },
    );

    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(store.openPreviewImageMenu).toHaveBeenCalledWith({
      target: "preview-target",
      x: 64,
      y: 96,
      items: [
        {
          label: EN_I18N.resourcePages.removeMenuItem,
          type: "item",
          value: "remove",
        },
      ],
    });
    expect(render).toHaveBeenCalled();
  });

  it("applies preview image selections and rerenders the route-graphics preview", async () => {
    const canvas = {};
    const backgroundImage = {
      id: "image-bg",
      type: "image",
      fileId: "file-bg",
      fileType: "image/png",
      width: 640,
      height: 360,
    };
    const store = {
      applyPreviewImageSelectorSelection: vi.fn(),
      selectDialogValues: vi.fn(() => ({
        x: "100",
        y: "120",
        scaleX: "1",
        scaleY: "1",
        rotation: "0",
        anchor: {
          anchorX: 0.5,
          anchorY: 0.5,
        },
      })),
      selectProjectResolution: vi.fn(() => ({
        width: 1920,
        height: 1080,
      })),
      selectDialogPreviewBackgroundImage: vi.fn(() => backgroundImage),
      selectDialogPreviewTargetImage: vi.fn(() => undefined),
    };
    const graphicsService = {
      attachCanvas: vi.fn(),
      loadAssets: vi.fn(),
      render: vi.fn(),
    };
    const projectService = {
      getFileContent: vi.fn(async () => ({
        url: "blob:file-bg",
        type: "image/png",
      })),
    };
    const render = vi.fn();

    await handleTransformPreviewImageSelected(
      {
        graphicsService,
        projectService,
        refs: {
          canvas,
        },
        render,
        store,
      },
      {
        _event: {
          detail: {
            imageId: "image-bg",
          },
        },
      },
    );

    expect(store.applyPreviewImageSelectorSelection).toHaveBeenCalledWith({
      imageId: "image-bg",
    });
    expect(render).toHaveBeenCalled();
    expect(graphicsService.attachCanvas).toHaveBeenCalledWith(canvas);
    expect(projectService.getFileContent).toHaveBeenCalledWith("file-bg");
    expect(graphicsService.loadAssets).toHaveBeenCalledWith({
      "file-bg": {
        url: "blob:file-bg",
        type: "image/png",
      },
    });
    expect(graphicsService.render).toHaveBeenNthCalledWith(1, {
      elements: [],
      animations: [],
      audio: [],
    });
    expect(graphicsService.render).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        elements: expect.arrayContaining([
          expect.objectContaining({
            id: "bg",
            type: "sprite",
            src: "file-bg",
          }),
        ]),
      }),
    );
  });

  it("removes a preview image selection and rerenders the route-graphics preview", async () => {
    const canvas = {};
    const store = {
      clearPreviewImage: vi.fn(),
      closePreviewImageMenu: vi.fn(),
      selectPreviewImageMenuTarget: vi.fn(() => "preview-background"),
      selectDialogValues: vi.fn(() => ({
        x: "100",
        y: "120",
        scaleX: "1",
        scaleY: "1",
        rotation: "0",
        anchor: {
          anchorX: 0.5,
          anchorY: 0.5,
        },
      })),
      selectProjectResolution: vi.fn(() => ({
        width: 1920,
        height: 1080,
      })),
      selectDialogPreviewBackgroundImage: vi.fn(() => undefined),
      selectDialogPreviewTargetImage: vi.fn(() => undefined),
    };
    const graphicsService = {
      attachCanvas: vi.fn(),
      loadAssets: vi.fn(),
      render: vi.fn(),
    };
    const render = vi.fn();

    await handleTransformPreviewImageMenuItemClick(
      {
        graphicsService,
        refs: {
          canvas,
        },
        render,
        store,
      },
      {
        _event: {
          detail: {
            item: {
              value: "remove",
            },
          },
        },
      },
    );

    expect(store.closePreviewImageMenu).toHaveBeenCalled();
    expect(store.clearPreviewImage).toHaveBeenCalledWith({
      target: "preview-background",
    });
    expect(render).toHaveBeenCalled();
    expect(graphicsService.attachCanvas).toHaveBeenCalledWith(canvas);
    expect(graphicsService.loadAssets).not.toHaveBeenCalled();
    expect(graphicsService.render).toHaveBeenNthCalledWith(1, {
      elements: [],
      animations: [],
      audio: [],
    });
    expect(graphicsService.render).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        elements: expect.arrayContaining([
          expect.objectContaining({
            id: "bg",
            type: "rect",
          }),
        ]),
      }),
    );
  });
});
