import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleAnimationItemClick,
  handleFileExplorerSelectionChanged,
  handleImportAnimationClick,
  handleImportFormActionClick,
} from "../../src/pages/animations/animations.handlers.js";

const originalFetch = globalThis.fetch;

describe("animations.handlers", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("selects an animation from the catalog without logging", () => {
    const deps = {
      store: {
        selectSelectedItemId: vi.fn(() => undefined),
        setSelectedItemId: vi.fn(),
        clearPreviewRuntime: vi.fn(),
        getState: vi.fn(() => ({
          isTouchMode: false,
          isMobileFileExplorerOpen: false,
        })),
      },
      refs: {
        fileExplorer: {
          selectItem: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    handleAnimationItemClick(deps, {
      _event: {
        detail: {
          itemId: "animation-1",
        },
      },
    });

    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "animation-1",
    });
    expect(deps.refs.fileExplorer.selectItem).toHaveBeenCalledWith({
      itemId: "animation-1",
    });
  });

  it("selects an animation from the file explorer without logging", () => {
    vi.stubGlobal("requestAnimationFrame", (callback) => {
      callback();
      return 1;
    });

    const deps = {
      store: {
        selectSelectedItemId: vi.fn(() => undefined),
        setSelectedItemId: vi.fn(),
        clearPreviewRuntime: vi.fn(),
        getState: vi.fn(() => ({
          isTouchMode: false,
          isMobileFileExplorerOpen: false,
        })),
      },
      render: vi.fn(),
    };

    handleFileExplorerSelectionChanged(deps, {
      _event: {
        detail: {
          itemId: "animation-1",
          isFolder: false,
        },
      },
    });

    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "animation-1",
    });

    vi.unstubAllGlobals();
  });

  it("renders the selected animation in the graphics preview canvas", async () => {
    let animationFrameCallback;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback) => {
        animationFrameCallback = callback;
        return 7;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const selectedAnimation = {
      id: "animation-1",
      type: "animation",
      name: "Fade",
      animation: {
        type: "update",
        tween: {
          alpha: {
            keyframes: [
              {
                duration: 1000,
                value: 0,
                easing: "linear",
              },
            ],
          },
        },
      },
    };
    let previewRequestId;
    const deps = {
      appService: {
        showToast: vi.fn(),
      },
      graphicsService: {
        init: vi.fn(async () => {}),
        loadAssets: vi.fn(async () => {}),
        render: vi.fn(),
        setAnimationPlaybackMode: vi.fn(),
        setAnimationTime: vi.fn(),
      },
      projectService: {
        getRepositoryState: vi.fn(() => ({
          images: {
            items: {},
          },
          files: {},
        })),
      },
      refs: {
        detailCanvas: {},
        fileExplorer: {
          selectItem: vi.fn(),
        },
      },
      store: {
        selectSelectedItemId: vi
          .fn()
          .mockReturnValueOnce(undefined)
          .mockReturnValue("animation-1"),
        setSelectedItemId: vi.fn(),
        clearPreviewRuntime: vi.fn(),
        getState: vi.fn(() => ({
          isTouchMode: false,
          isMobileFileExplorerOpen: false,
        })),
        selectSelectedAnimation: vi.fn(() => selectedAnimation),
        selectProjectResolution: vi.fn(() => ({
          width: 800,
          height: 600,
        })),
        selectPreviewRuntime: vi.fn(() => ({})),
        setPreviewRuntime: vi.fn(),
        selectImagesData: vi.fn(() => ({
          items: {},
          tree: [],
        })),
        selectAnimationPreviewFrameId: vi.fn(() => undefined),
        clearAnimationPreviewPlayback: vi.fn(),
        selectAnimationPreviewStartedAtMs: vi.fn(() => undefined),
        setAnimationPreviewFrameId: vi.fn(),
        setAnimationPreviewStartedAtMs: vi.fn(),
        setAnimationPreviewRequestId: vi.fn(({ requestId } = {}) => {
          previewRequestId = requestId;
        }),
        selectAnimationPreviewRequestId: vi.fn(() => previewRequestId),
      },
      render: vi.fn(),
    };

    await handleAnimationItemClick(deps, {
      _event: {
        detail: {
          itemId: "animation-1",
        },
      },
    });

    expect(deps.graphicsService.init).toHaveBeenCalledWith({
      canvas: deps.refs.detailCanvas,
      width: 800,
      height: 600,
    });
    expect(deps.graphicsService.render).toHaveBeenCalledTimes(2);
    expect(deps.graphicsService.setAnimationPlaybackMode).toHaveBeenCalledWith(
      "manual",
    );
    expect(deps.graphicsService.setAnimationTime).toHaveBeenCalledWith(0);
    expect(
      deps.graphicsService.setAnimationTime.mock.invocationCallOrder[0],
    ).toBeLessThan(deps.graphicsService.render.mock.invocationCallOrder[0]);
    expect(deps.store.setAnimationPreviewFrameId).toHaveBeenCalledWith({
      frameId: 7,
    });

    await animationFrameCallback(250);

    expect(deps.store.setAnimationPreviewStartedAtMs).toHaveBeenCalledWith({
      startedAtMs: 250,
    });
    expect(deps.graphicsService.setAnimationTime).toHaveBeenLastCalledWith(0);

    await animationFrameCallback(1250);

    expect(deps.graphicsService.setAnimationTime).toHaveBeenLastCalledWith(999);

    await animationFrameCallback(1600);

    expect(deps.graphicsService.setAnimationTime).toHaveBeenLastCalledWith(999);

    await animationFrameCallback(1800);

    expect(deps.graphicsService.setAnimationTime).toHaveBeenLastCalledWith(999);

    await animationFrameCallback(2300);

    expect(deps.graphicsService.render).toHaveBeenCalledTimes(4);
    expect(deps.graphicsService.render.mock.calls[2][0].animations).toEqual([]);
    expect(deps.graphicsService.setAnimationTime).toHaveBeenLastCalledWith(50);

    vi.unstubAllGlobals();
  });

  it("primes transition previews before revealing the first live frame", async () => {
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 7),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const selectedAnimation = {
      id: "transition-1",
      type: "animation",
      name: "Swipe",
      animation: {
        type: "transition",
        prev: {
          tween: {
            alpha: {
              keyframes: [
                {
                  duration: 1000,
                  value: 0,
                  easing: "linear",
                },
              ],
            },
          },
        },
      },
    };
    let previewRequestId;
    const deps = {
      appService: {
        showToast: vi.fn(),
      },
      graphicsService: {
        init: vi.fn(async () => {}),
        loadAssets: vi.fn(async () => {}),
        render: vi.fn(),
        setAnimationPlaybackMode: vi.fn(),
        setAnimationTime: vi.fn(),
      },
      projectService: {
        getRepositoryState: vi.fn(() => ({
          images: {
            items: {},
          },
          files: {},
        })),
      },
      refs: {
        detailCanvas: {},
        fileExplorer: {
          selectItem: vi.fn(),
        },
      },
      store: {
        selectSelectedItemId: vi
          .fn()
          .mockReturnValueOnce(undefined)
          .mockReturnValue("transition-1"),
        setSelectedItemId: vi.fn(),
        clearPreviewRuntime: vi.fn(),
        getState: vi.fn(() => ({
          isTouchMode: false,
          isMobileFileExplorerOpen: false,
        })),
        selectSelectedAnimation: vi.fn(() => selectedAnimation),
        selectProjectResolution: vi.fn(() => ({
          width: 800,
          height: 600,
        })),
        selectPreviewRuntime: vi.fn(() => ({})),
        setPreviewRuntime: vi.fn(),
        selectImagesData: vi.fn(() => ({
          items: {},
          tree: [],
        })),
        selectAnimationPreviewFrameId: vi.fn(() => undefined),
        clearAnimationPreviewPlayback: vi.fn(),
        selectAnimationPreviewStartedAtMs: vi.fn(() => undefined),
        setAnimationPreviewFrameId: vi.fn(),
        setAnimationPreviewStartedAtMs: vi.fn(),
        setAnimationPreviewRequestId: vi.fn(({ requestId } = {}) => {
          previewRequestId = requestId;
        }),
        selectAnimationPreviewRequestId: vi.fn(() => previewRequestId),
        setAnimationPreviewVisible: vi.fn(),
      },
      render: vi.fn(),
    };

    await handleAnimationItemClick(deps, {
      _event: {
        detail: {
          itemId: "transition-1",
        },
      },
    });

    expect(deps.graphicsService.render).toHaveBeenCalledTimes(4);
    expect(deps.graphicsService.render.mock.calls[0][0].animations).toEqual([]);
    expect(
      deps.graphicsService.render.mock.calls[1][0].animations[0].type,
    ).toBe("transition");
    expect(deps.graphicsService.render.mock.calls[2][0].animations).toEqual([]);
    expect(
      deps.graphicsService.render.mock.calls[3][0].animations[0].type,
    ).toBe("transition");
    expect(deps.store.setAnimationPreviewVisible).toHaveBeenLastCalledWith({
      visible: true,
    });

    vi.unstubAllGlobals();
  });

  it("opens animation import as a global page action", () => {
    const render = vi.fn();
    const store = {
      openImportDialog: vi.fn(),
    };

    handleImportAnimationClick({ render, store });

    expect(store.openImportDialog).toHaveBeenCalledWith();
    expect(render).toHaveBeenCalled();
  });

  it("shows an alert when the import URL is invalid", async () => {
    const appService = {
      showAlert: vi.fn(),
      showToast: vi.fn(),
    };
    globalThis.fetch = vi.fn();

    await handleImportFormActionClick(
      {
        appService,
        projectService: {},
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
      message: "Enter a valid http(s) URL.",
      title: "Error",
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("shows an alert when animation image dependencies are missing", async () => {
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
        repository: {
          animations: {
            items: {
              "animation.mask": {
                id: "animation.mask",
                type: "animation",
                name: "Mask Animation",
                animation: {
                  type: "transition",
                  mask: {
                    kind: "single",
                    imageId: "image.missing",
                  },
                },
              },
            },
            tree: [{ id: "animation.mask" }],
          },
          images: {
            items: {},
          },
        },
      })),
    }));

    await handleImportFormActionClick(
      {
        appService,
        projectService: {},
        render: vi.fn(),
        store,
      },
      {
        _event: {
          detail: {
            actionId: "continue",
            valid: true,
            values: {
              url: "https://example.com/import-animation-mask-sample.json",
            },
          },
        },
      },
    );

    expect(appService.showAlert).toHaveBeenCalledWith({
      message: 'Image dependency "image.missing" is missing from the package.',
      title: "Error",
    });
    expect(store.openImportDestinationStep).not.toHaveBeenCalled();
  });

  it("continues to folder selection after parsing a valid animation package", async () => {
    const appService = {
      showAlert: vi.fn(),
      showToast: vi.fn(),
    };
    const store = {
      openImportDestinationStep: vi.fn(),
    };
    const importInput = {
      schema: "routevn.import-pack.v1",
      repository: {
        animations: {
          items: {
            "animation.mask": {
              id: "animation.mask",
              type: "animation",
              name: "Mask Animation",
              animation: {
                type: "transition",
                mask: {
                  kind: "single",
                  imageId: "image.mask",
                  channel: "alpha",
                },
              },
            },
          },
          tree: [{ id: "animation.mask" }],
        },
        images: {
          items: {
            "image.mask": {
              id: "image.mask",
              type: "image",
              name: "Mask",
              fileId: "file.mask",
            },
          },
        },
      },
      files: {
        "file.mask": {
          url: "https://example.com/mask.png",
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
        appService,
        projectService: {},
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
      includeImages: true,
    });
  });

  it("imports animations and rewrites mask image dependencies", async () => {
    const importedAnimations = [];
    const importInput = {
      schema: "routevn.import-pack.v1",
      repository: {
        animations: {
          items: {
            "animation.shake": {
              id: "animation.shake",
              type: "animation",
              name: "Shake",
              animation: {
                type: "update",
                tween: {
                  x: {
                    keyframes: [
                      {
                        duration: 100,
                        value: 12,
                        easing: "linear",
                        relative: true,
                      },
                    ],
                  },
                },
              },
            },
            "animation.mask": {
              id: "animation.mask",
              type: "animation",
              name: "Mask Animation",
              animation: {
                type: "transition",
                mask: {
                  kind: "single",
                  imageId: "image.mask",
                  channel: "alpha",
                },
              },
            },
          },
          tree: [{ id: "animation.shake" }, { id: "animation.mask" }],
        },
        images: {
          items: {
            "image.mask": {
              id: "image.mask",
              type: "image",
              name: "Mask",
              fileId: "file.mask",
            },
          },
        },
      },
      files: {
        "file.mask": {
          url: "https://example.com/mask.png",
          name: "mask.png",
          mimeType: "image/png",
        },
      },
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
      setAnimationPreviewVisible: vi.fn(),
      setItems: vi.fn(),
      setSelectedFolderId: vi.fn(),
      setSelectedItemId: vi.fn(),
      setTagsData: vi.fn(),
      setProjectResolution: vi.fn(),
      setImagesData: vi.fn(),
      selectSelectedItemId: vi.fn(() => importedAnimations[0]?.animationId),
      selectAnimationItemById: vi.fn(({ itemId } = {}) => {
        return importedAnimations.find(
          (animation) => animation.animationId === itemId,
        )?.data;
      }),
      clearPreviewRuntime: vi.fn(),
    };
    const projectService = {
      importImageFile: vi.fn(async () => ({
        imageId: "project-image-mask",
      })),
      createAnimation: vi.fn(async (input) => {
        importedAnimations.push(input);
        return input.animationId;
      }),
      getRepositoryState: vi.fn(() => ({
        animations: {
          items: Object.fromEntries(
            importedAnimations.map((animation) => [
              animation.animationId,
              {
                id: animation.animationId,
                ...animation.data,
              },
            ]),
          ),
          tree: importedAnimations.map((animation) => ({
            id: animation.animationId,
          })),
        },
        images: {
          items: {},
          tree: [],
        },
        project: {},
        tags: {},
      })),
    };
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      blob: vi.fn(async () => new Blob(["mask"], { type: "image/png" })),
    }));

    await handleImportFormActionClick(
      {
        appService,
        projectService,
        refs: {
          fileExplorer: {
            selectItem: vi.fn(),
          },
        },
        render,
        store,
      },
      {
        _event: {
          detail: {
            actionId: "import",
            valid: true,
            values: {
              animationFolderId: "folder-animation",
              imageFolderId: "folder-image",
            },
          },
        },
      },
    );

    expect(projectService.importImageFile).toHaveBeenCalledWith({
      file: expect.objectContaining({
        name: "mask.png",
      }),
      imageId: expect.any(String),
      parentId: "folder-image",
    });
    expect(projectService.createAnimation).toHaveBeenCalledTimes(2);
    expect(
      projectService.createAnimation.mock.calls[0][0].data,
    ).not.toHaveProperty("_level");
    expect(
      projectService.createAnimation.mock.calls[0][0].data,
    ).not.toHaveProperty("fullLabel");
    expect(
      projectService.createAnimation.mock.calls[0][0].data,
    ).not.toHaveProperty("hasChildren");
    expect(
      projectService.createAnimation.mock.calls[1][0].data,
    ).not.toHaveProperty("_level");
    expect(
      projectService.createAnimation.mock.calls[1][0].data,
    ).not.toHaveProperty("fullLabel");
    expect(
      projectService.createAnimation.mock.calls[1][0].data,
    ).not.toHaveProperty("hasChildren");
    expect(projectService.createAnimation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Shake",
        }),
        parentId: "folder-animation",
      }),
    );
    expect(projectService.createAnimation).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          animation: expect.objectContaining({
            mask: expect.objectContaining({
              imageId: "project-image-mask",
            }),
          }),
        }),
        parentId: "folder-animation",
      }),
    );
    expect(store.closeImportDialog).toHaveBeenCalled();
    expect(store.setSearchQuery).toHaveBeenCalledWith({ value: "" });
    expect(store.setActiveTagIds).toHaveBeenCalledWith({ tagIds: [] });
    expect(appService.showToast).toHaveBeenCalledWith({
      message: "Animations imported.",
    });
  });
});
