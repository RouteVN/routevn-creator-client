import { produce } from "immer";
import { Subject } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as particleEditorStore from "../../src/pages/particleEditor/particleEditor.store.js";
import {
  handleAfterMount,
  handleBackClick,
  handleBackgroundImageClick,
  handleBackgroundImageContextMenu,
  handleBackgroundImageMenuItemClick,
  handleBeforeMount,
  handleCanvasZoomInClick,
  handleFormTabClick,
  handleImageSelectorConfirmClick,
  handleImageSelectorDialogClose,
  handleImageSelectorImageSelected,
  handleParticleFormChange,
  handleRedoButtonClick,
  handleRightPanelModeChange,
  handleSavePreviewClick,
  handleTextureImageClick,
  handleTextureImageKeyDown,
  handleUndoButtonClick,
} from "../../src/pages/particleEditor/particleEditor.handlers.js";
import { createParticlePreset } from "../../src/pages/particles/support/particlePresets.js";
import { captureEditorPreviewImages } from "../../src/internal/ui/editorPreviewCapture.js";
import { EN_I18N } from "../support/i18n.js";

// The canvas capture needs a renderer; storing the captured image runs as it
// is.
vi.mock(
  "../../src/internal/ui/editorPreviewCapture.js",
  async (importOriginal) => ({
    ...(await importOriginal()),
    captureEditorPreviewImages: vi.fn(),
  }),
);

// Edits save on their own 300ms after the last one.
const AUTOSAVE_WAIT_MS = 400;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The Snow preset at 640 × 360, with its source moved onto the canvas.
const createSavedParticle = () => {
  const snow = createParticlePreset({
    presetId: "snow",
    projectResolution: { width: 640, height: 360 },
  });
  snow.modules.emission.source = {
    kind: "rect",
    data: { x: 100, y: 50, width: 200, height: 40 },
  };
  return {
    id: "particle-1",
    type: "particle",
    name: "Particle One",
    description: "Falling flakes.",
    tagIds: ["tag-1"],
    width: snow.width,
    height: snow.height,
    seed: snow.seed,
    modules: snow.modules,
    thumbnailFileId: "thumb-1",
  };
};

const imagesData = {
  tree: [{ id: "image-1" }, { id: "image-2" }],
  items: {
    "image-1": {
      id: "image-1",
      type: "image",
      name: "Image One",
      fileId: "file-1",
      width: 32,
      height: 32,
    },
    "image-2": {
      id: "image-2",
      type: "image",
      name: "Image Two",
      fileId: "file-2",
      width: 640,
      height: 360,
    },
  },
};

// The page on its real store, opened on a saved particle. The canvas is 320
// CSS pixels wide, so a CSS pixel is two canvas units.
const createPage = async ({
  item = createSavedParticle(),
  uiConfig = {},
} = {}) => {
  let state = particleEditorStore.createInitialState();
  const store = new Proxy(
    {},
    {
      get: (_target, name) => (payload) => {
        if (name.startsWith("select")) {
          return particleEditorStore[name]({ state, i18n: EN_I18N }, payload);
        }
        let result;
        state = produce(state, (draft) => {
          result = particleEditorStore[name]({ state: draft }, payload);
        });
        return result;
      },
    },
  );
  const subject = new Subject();
  subject.dispatch = (action, payload) => subject.next({ action, payload });
  const windowListeners = {};
  const windowMetricsListeners = new Set();
  let beforeNavigation;
  let storedFileCount = 0;
  const repositoryState = {
    project: { resolution: { width: 1920, height: 1080 } },
    images: imagesData,
    particles: {
      tree: [{ id: item.id }],
      items: { [item.id]: item },
    },
  };
  const deps = {
    store,
    subject,
    render: vi.fn(),
    i18n: EN_I18N,
    uiConfig,
    windowMetricsClient: {
      subscribe: (listener) => {
        windowMetricsListeners.add(listener);
        return () => windowMetricsListeners.delete(listener);
      },
    },
    refs: {
      canvas: { getBoundingClientRect: () => ({ width: 320 }) },
      canvasBackground: { centerContent: vi.fn() },
    },
    graphicsService: {
      init: vi.fn(async () => {}),
      render: vi.fn(),
      loadAssets: vi.fn(async () => {}),
      destroy: vi.fn(async () => {}),
    },
    browserEventsClient: {
      subscribeWindowEvent: ({ type, listener }) => {
        windowListeners[type] = listener;
        return () => delete windowListeners[type];
      },
    },
    appService: {
      getPayload: () => ({ p: "project-1", pt: item.id }),
      navigate: vi.fn(),
      showAlert: vi.fn(),
      showToast: vi.fn(),
      registerBeforeNavigation: (handler) => {
        beforeNavigation = handler;
        return () => {};
      },
    },
    projectService: {
      ensureRepository: async () => {},
      getRepositoryState: () => repositoryState,
      getFileContent: vi.fn(async (fileId) => ({
        url: `blob:${fileId}`,
        type: "image/png",
      })),
      updateParticle: vi.fn(async () => ({ valid: true })),
      storeFile: vi.fn(async () => {
        storedFileCount += 1;
        return {
          fileId: `stored-${storedFileCount}`,
          fileRecords: [{ id: `record-${storedFileCount}` }],
        };
      }),
    },
  };
  const cleanup = handleBeforeMount(deps);
  await handleAfterMount(deps);

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const lastRender = () => deps.graphicsService.render.mock.lastCall[0];
  const findElement = (elements, id) =>
    (elements ?? []).find((element) => element.id === id);
  const press = async (key, options = {}) => {
    const event = {
      key,
      shiftKey: false,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      defaultPrevented: false,
      preventDefault: vi.fn(),
      composedPath: () => [],
      ...options,
    };
    await windowListeners.keydown(event);
    await flush();
    return event;
  };
  const drag = async (points, targetId = "selected-border") => {
    subject.dispatch("border-drag-start", { targetId });
    for (const [x, y] of points) {
      subject.dispatch("border-drag-move", { targetId, x, y });
    }
    subject.dispatch("border-drag-end", { targetId });
    await flush();
  };
  const changeField = (name, value) =>
    handleParticleFormChange(deps, {
      _event: { detail: { name, value, values: { [name]: value } } },
    });
  const pickImage = async (open, imageId) => {
    open(deps);
    await handleImageSelectorImageSelected(deps, {
      _event: { detail: { imageId } },
    });
  };
  return {
    deps,
    store,
    cleanup,
    state: () => state,
    effect: () => state.effect,
    view: () => particleEditorStore.selectViewData({ state, i18n: EN_I18N }),
    lastRender,
    findElement,
    press,
    drag,
    flush,
    changeField,
    pickImage,
    beforeNavigation: () => beforeNavigation(),
    resizeWindow: async (metrics) => {
      windowMetricsListeners.forEach((listener) => listener(metrics));
      await flush();
    },
    savedData: () =>
      deps.projectService.updateParticle.mock.calls.map(([call]) => call),
  };
};

const capturedImages = {
  thumbnailImage: "data:image/png;base64,dGh1bWI=",
};

const pickTexture = async (page, imageId) => {
  await page.pickImage(handleTextureImageClick, imageId);
  await handleImageSelectorConfirmClick(page.deps);
};

const pickBackground = async (page, imageId) => {
  await page.pickImage(handleBackgroundImageClick, imageId);
  await handleImageSelectorConfirmClick(page.deps);
};

const showPreviewTab = (page) =>
  handleRightPanelModeChange(page.deps, {
    _event: { detail: { id: "preview" } },
  });

const showFormTab = (page, id) =>
  handleFormTabClick(page.deps, { _event: { detail: { id } } });

// Image One's file cannot be read, as in an imported project that lacks it.
const failImageOneFile = (page) => {
  page.deps.projectService.getFileContent.mockImplementation(async (fileId) => {
    if (fileId === "file-1") {
      throw new Error("File file-1 is missing.");
    }
    return { url: `blob:${fileId}`, type: "image/png" };
  });
};

const fileReads = (page, fileId) =>
  page.deps.projectService.getFileContent.mock.calls.filter(
    ([readFileId]) => readFileId === fileId,
  );

beforeEach(() => {
  captureEditorPreviewImages.mockReset();
  captureEditorPreviewImages.mockResolvedValue(capturedImages);
});

describe("particle editor", () => {
  it("opens the particle on a canvas of its own size, with the source outline on the Source tab", async () => {
    const page = await createPage();

    expect(page.deps.graphicsService.init).toHaveBeenCalledWith({
      canvas: page.deps.refs.canvas,
      width: 640,
      height: 360,
    });
    // Basics is open, so the source outline does not draw.
    expect(page.lastRender().elements.map((element) => element.id)).toEqual([
      "particle-preview-bg",
    ]);
    expect(page.view()).toMatchObject({
      particleName: "Particle One",
      undoDisabled: true,
      redoDisabled: true,
      canvasAspectRatio: "640 / 360",
      // No texture yet, so the particles do not draw.
      showTextureHint: true,
      textureHint: "Choose a texture image in Appearance to see the particles.",
      formTab: "basics",
    });
    expect(page.view().formValues).toMatchObject({
      width: "640",
      height: "360",
      seed: "20260408",
    });
    expect(page.view().particleForm.fields.map((field) => field.name)).toEqual([
      "width",
      "height",
      "seed",
    ]);

    await showFormTab(page, "source");
    const elements = page.lastRender().elements;
    expect(elements.map((element) => element.id)).toEqual([
      "particle-preview-bg",
      "selected-border",
    ]);
    // The outline is inset by its 2-pixel border: 4 canvas units.
    expect(page.findElement(elements, "selected-border")).toMatchObject({
      x: 104,
      y: 54,
      width: 192,
      height: 32,
      border: { width: 4 },
      drag: expect.any(Object),
    });
  });

  it("alerts and goes back when the particle is missing", async () => {
    const page = await createPage({
      item: { ...createSavedParticle(), type: "folder" },
    });

    expect(page.deps.appService.showAlert).toHaveBeenCalledWith({
      title: "Error",
      message: "Particle not found.",
    });
    expect(page.deps.appService.navigate).toHaveBeenCalledWith(
      "/project/particles",
      { p: "project-1" },
      { historyMode: "replace" },
    );
  });

  it("applies the field that changed and keeps the curves it does not show", async () => {
    const saved = createSavedParticle();
    const page = await createPage({ item: saved });

    await page.changeField("emissionRate", 30);

    const { modules } = page.effect();
    expect(modules.emission.rate).toBe(30);
    expect(modules.appearance.alpha).toEqual(saved.modules.appearance.alpha);
    expect(modules.appearance.scale).toEqual(saved.modules.appearance.scale);
    expect(modules.appearance.rotation).toEqual(
      saved.modules.appearance.rotation,
    );
    expect(modules.bounds).toEqual(saved.modules.bounds);
    expect(page.state().editHistory.undo).toHaveLength(1);
  });

  it("makes one undo step of quick changes to one field", async () => {
    const page = await createPage();

    await page.changeField("emissionRate", 30);
    await page.changeField("emissionRate", 40);
    expect(page.state().editHistory.undo).toHaveLength(1);

    await page.changeField("lifetimeMin", 2);
    expect(page.state().editHistory.undo).toHaveLength(2);

    await handleUndoButtonClick(page.deps);
    expect(page.effect().modules.emission.particleLifetime.min).toBe(8.5);
    await handleUndoButtonClick(page.deps);
    expect(page.effect().modules.emission.rate).toBe(64);
    await handleRedoButtonClick(page.deps);
    expect(page.effect().modules.emission.rate).toBe(40);
  });

  it("undoes with the shortcut, and puts the values back into the form", async () => {
    const page = await createPage();
    await page.changeField("width", 800);
    const formKey = page.view().particleFormKey;

    const event = await page.press("z", { metaKey: true });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(page.effect().width).toBe(640);
    expect(page.view().formValues.width).toBe("640");
    // The form remounts with the restored values.
    expect(page.view().particleFormKey).not.toBe(formKey);

    await page.press("z", { metaKey: true, shiftKey: true });
    expect(page.effect().width).toBe(800);
  });

  it("leaves the shortcut to a focused text field", async () => {
    const page = await createPage();
    await page.changeField("width", 800);

    const event = await page.press("z", {
      metaKey: true,
      composedPath: () => [{ tagName: "INPUT", type: "number" }],
    });

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(page.effect().width).toBe(800);
  });

  it("saves only the particle's effect on its own a moment after", async () => {
    const page = await createPage();
    await page.changeField("emissionRate", 30);
    await page.changeField("emissionRate", 31);

    expect(page.savedData()).toEqual([]);
    await wait(AUTOSAVE_WAIT_MS);

    expect(page.savedData()).toHaveLength(1);
    const [{ particleId, data }] = page.savedData();
    expect(particleId).toBe("particle-1");
    expect(Object.keys(data).sort()).toEqual([
      "height",
      "modules",
      "seed",
      "width",
    ]);
    expect(data).toMatchObject({ width: 640, height: 360, seed: 20260408 });
    expect(data.modules.emission.rate).toBe(31);
    expect(captureEditorPreviewImages).not.toHaveBeenCalled();
  });

  it("saves waiting edits at once when it leaves", async () => {
    const page = await createPage();
    await page.changeField("emissionRate", 30);

    await handleBackClick(page.deps);

    expect(
      page.savedData().map(({ data }) => data.modules.emission.rate),
    ).toEqual([30]);
    expect(page.deps.appService.navigate).toHaveBeenCalledWith(
      "/project/particles",
      { p: "project-1" },
      { historyMode: "replace" },
    );

    await page.beforeNavigation();
    await wait(AUTOSAVE_WAIT_MS);
    expect(page.savedData()).toHaveLength(1);
  });

  it("saves nothing when an edit is undone before it saves", async () => {
    const page = await createPage();
    await page.changeField("emissionRate", 30);
    await page.press("z", { metaKey: true });

    await handleBackClick(page.deps);
    await wait(AUTOSAVE_WAIT_MS);

    expect(page.savedData()).toEqual([]);
  });

  it("keeps the page open when the save fails", async () => {
    const page = await createPage();
    page.deps.projectService.updateParticle.mockResolvedValue({ valid: false });
    await page.changeField("emissionRate", 30);

    await handleBackClick(page.deps);

    expect(page.deps.appService.navigate).not.toHaveBeenCalled();
    expect(page.deps.appService.showAlert).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Failed to save particle." }),
    );
    await expect(page.beforeNavigation()).rejects.toThrow(
      "Failed to save particle before navigation.",
    );
  });

  it("starts the canvas again at a new size when the width changes", async () => {
    const page = await createPage();
    await pickTexture(page, "image-1");
    expect(page.deps.graphicsService.loadAssets).toHaveBeenCalledOnce();

    await page.changeField("width", 800);

    expect(page.deps.graphicsService.init).toHaveBeenLastCalledWith({
      canvas: page.deps.refs.canvas,
      width: 800,
      height: 360,
    });
    expect(page.view().canvasAspectRatio).toBe("800 / 360");
    // The new renderer loads the texture again.
    expect(page.deps.graphicsService.loadAssets).toHaveBeenCalledTimes(2);
    expect(
      page.findElement(page.lastRender().elements, "particle-preview"),
    ).toMatchObject({ width: 800, height: 360 });
  });

  it("previews a texture while it is picked, and confirming it is one edit", async () => {
    const page = await createPage();

    await page.pickImage(handleTextureImageClick, "image-1");
    expect(
      page.findElement(page.lastRender().elements, "particle-preview").modules
        .appearance.texture,
    ).toBe("file-1");
    expect(page.view().showTextureHint).toBe(false);
    expect(page.effect().modules.appearance.texture).toBeUndefined();

    await handleImageSelectorDialogClose(page.deps);
    expect(
      page.findElement(page.lastRender().elements, "particle-preview"),
    ).toBeUndefined();
    expect(page.state().editHistory.undo).toHaveLength(0);

    await pickTexture(page, "image-1");
    expect(page.effect().modules.appearance.texture).toBe("image-1");
    expect(page.view().textureImage).toEqual({
      name: "Image One",
      previewFileId: "file-1",
    });
    expect(page.state().editHistory.undo).toHaveLength(1);
    await wait(AUTOSAVE_WAIT_MS);
    expect(page.savedData()[0].data.modules.appearance.texture).toBe("image-1");
  });

  it.each(["Enter", " "])(
    "opens the texture picker on the current texture with %j",
    async (key) => {
      const page = await createPage();
      await pickTexture(page, "image-1");
      const preventDefault = vi.fn();

      handleTextureImageKeyDown(page.deps, { _event: { key, preventDefault } });

      expect(preventDefault).toHaveBeenCalledOnce();
      expect(page.view().imageSelectorDialog).toMatchObject({
        open: true,
        slot: "texture",
        selectedImageId: "image-1",
      });
    },
  );

  it("saves the preview background with Save Preview, not with edits", async () => {
    const page = await createPage();
    await pickTexture(page, "image-1");
    await pickBackground(page, "image-2");
    expect(
      page.findElement(page.lastRender().elements, "particle-preview-bg"),
    ).toMatchObject({ type: "sprite", src: "file-2" });
    await wait(AUTOSAVE_WAIT_MS);
    expect(page.savedData()).toHaveLength(1);
    expect(JSON.stringify(page.savedData())).not.toContain("image-2");
    await showPreviewTab(page);

    await handleSavePreviewClick(page.deps);

    const [{ renderState, thumbnailOnly }] =
      captureEditorPreviewImages.mock.calls[0];
    expect(thumbnailOnly).toBe(true);
    expect(renderState.elements.map((element) => element.id)).toEqual([
      "particle-preview-bg",
      "particle-preview",
    ]);
    expect(renderState.elements[0]).toMatchObject({ src: "file-2" });
    expect(page.savedData()[1]).toEqual({
      particleId: "particle-1",
      data: {
        thumbnailFileId: "stored-1",
        preview: { background: { imageId: "image-2" } },
      },
      fileRecords: [{ id: "record-1" }],
    });
    expect(page.deps.projectService.storeFile).toHaveBeenCalledOnce();
    expect(page.deps.appService.showToast).toHaveBeenCalledWith({
      message: "Particle preview saved.",
    });
  });

  it("opens with the saved preview background, and Save Preview clears a removed one", async () => {
    const page = await createPage({
      item: {
        ...createSavedParticle(),
        preview: { background: { imageId: "image-2" } },
      },
    });
    expect(page.view().backgroundImage.name).toBe("Image Two");
    expect(
      page.findElement(page.lastRender().elements, "particle-preview-bg"),
    ).toMatchObject({ type: "sprite", src: "file-2" });

    await showPreviewTab(page);
    handleBackgroundImageContextMenu(page.deps, {
      _event: {
        clientX: 10,
        clientY: 20,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      },
    });
    await handleBackgroundImageMenuItemClick(page.deps, {
      _event: { detail: { item: { value: "remove" } } },
    });
    expect(page.view().backgroundImage).toBeUndefined();

    await handleSavePreviewClick(page.deps);
    expect(page.savedData().at(-1).data).toEqual({
      thumbnailFileId: "stored-1",
      preview: {},
    });
  });

  it("removes the preview background from its menu, and cancel restores it", async () => {
    const page = await createPage();
    await pickBackground(page, "image-2");

    await page.pickImage(handleBackgroundImageClick, "image-1");
    expect(
      page.findElement(page.lastRender().elements, "particle-preview-bg"),
    ).toMatchObject({ src: "file-1" });
    await handleImageSelectorDialogClose(page.deps);
    expect(page.view().backgroundImage.name).toBe("Image Two");

    handleBackgroundImageContextMenu(page.deps, {
      _event: {
        clientX: 10,
        clientY: 20,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      },
    });
    expect(page.view().backgroundImageMenu.isOpen).toBe(true);
    await handleBackgroundImageMenuItemClick(page.deps, {
      _event: { detail: { item: { value: "remove" } } },
    });

    expect(page.view().backgroundImage).toBeUndefined();
    expect(
      page.findElement(page.lastRender().elements, "particle-preview-bg"),
    ).toMatchObject({ type: "rect", fill: "#000000" });
    expect(page.state().editHistory.undo).toHaveLength(0);
  });

  it("saves the values before the thumbnail with Save Preview", async () => {
    const page = await createPage();
    await page.changeField("emissionRate", 30);

    await handleSavePreviewClick(page.deps);

    expect(page.savedData()).toEqual([
      {
        particleId: "particle-1",
        data: expect.objectContaining({ width: 640 }),
      },
      {
        particleId: "particle-1",
        data: { thumbnailFileId: "stored-1", preview: {} },
        fileRecords: [{ id: "record-1" }],
      },
    ]);
  });

  it("saves one thumbnail when Save Preview is clicked twice", async () => {
    let finishCapture;
    captureEditorPreviewImages.mockReturnValue(
      new Promise((resolve) => {
        finishCapture = () => resolve(capturedImages);
      }),
    );
    const page = await createPage();

    const firstClick = handleSavePreviewClick(page.deps);
    const secondClick = handleSavePreviewClick(page.deps);
    expect(page.view().savePreviewDisabled).toBe(true);
    await page.flush();
    finishCapture();
    await Promise.all([firstClick, secondClick]);

    expect(captureEditorPreviewImages).toHaveBeenCalledOnce();
    expect(page.deps.projectService.storeFile).toHaveBeenCalledOnce();
    expect(page.savedData()).toHaveLength(1);
    expect(page.view().savePreviewDisabled).toBe(false);
  });

  it("alerts with the details when the canvas cannot be captured", async () => {
    captureEditorPreviewImages.mockRejectedValue(
      new Error("The canvas returned no preview image."),
    );
    const page = await createPage();
    await showFormTab(page, "source");

    await handleSavePreviewClick(page.deps);

    expect(page.savedData()).toEqual([]);
    expect(page.deps.projectService.storeFile).not.toHaveBeenCalled();
    expect(page.deps.appService.showAlert).toHaveBeenCalledWith({
      title: "Error",
      message:
        "Failed to capture the particle preview.\n\nDetails:\nThe canvas returned no preview image.",
    });
    // The canvas shows the outline again after the capture.
    expect(
      page.findElement(page.lastRender().elements, "selected-border"),
    ).toBeTruthy();
  });

  it("alerts with the details when the thumbnail cannot be stored", async () => {
    const page = await createPage();
    page.deps.projectService.storeFile.mockRejectedValue(
      new Error("The disk is full."),
    );

    await handleSavePreviewClick(page.deps);

    expect(page.savedData()).toEqual([]);
    expect(page.deps.appService.showAlert).toHaveBeenCalledWith({
      title: "Error",
      message:
        "Failed to save the particle preview.\n\nDetails:\nThe disk is full.",
    });
    expect(page.view().savePreviewDisabled).toBe(false);
  });

  it("keeps the canvas editable when the texture fails to load, and warns once", async () => {
    const page = await createPage();
    failImageOneFile(page);

    await pickTexture(page, "image-1");
    await pickBackground(page, "image-2");
    await showFormTab(page, "source");

    const elements = page.lastRender().elements;
    // The particles leave out the texture they cannot draw; the background
    // and the outline still draw.
    expect(elements.map((element) => element.id)).toEqual([
      "particle-preview-bg",
      "selected-border",
    ]);
    expect(page.findElement(elements, "particle-preview-bg")).toMatchObject({
      src: "file-2",
    });
    expect(page.deps.appService.showAlert).toHaveBeenCalledOnce();
    expect(page.deps.appService.showAlert).toHaveBeenCalledWith({
      title: "Warning",
      message: expect.stringContaining("Images: Image One"),
    });
    // The texture is set, so the canvas does not ask for one.
    expect(page.view().showTextureHint).toBe(false);

    await page.changeField("emissionRate", 30);
    await handleCanvasZoomInClick(page.deps);

    expect(page.effect().modules.emission.rate).toBe(30);
    expect(fileReads(page, "file-1")).toHaveLength(1);
    expect(page.deps.appService.showAlert).toHaveBeenCalledOnce();
    expect(page.deps.appService.showToast).not.toHaveBeenCalled();
  });

  it("alerts with the details and saves no thumbnail when the texture cannot load", async () => {
    const page = await createPage();
    failImageOneFile(page);
    await pickTexture(page, "image-1");
    await showPreviewTab(page);

    await handleSavePreviewClick(page.deps);

    // Save Preview reads the file again before it gives up.
    expect(fileReads(page, "file-1")).toHaveLength(2);
    expect(page.deps.appService.showAlert).toHaveBeenLastCalledWith({
      title: "Error",
      message:
        'Could not load the image "Image One", so the preview was not saved. Check its file, or pick another image.\n\nDetails:\nFile file-1 is missing.',
    });
    expect(captureEditorPreviewImages).not.toHaveBeenCalled();
    expect(page.savedData().map(({ data }) => data.thumbnailFileId)).toEqual([
      undefined,
    ]);
    expect(page.view().savePreviewDisabled).toBe(false);
  });

  it("draws the outline on Edit's Source tab only", async () => {
    const page = await createPage();
    await pickTexture(page, "image-1");
    const basicsElements = page.lastRender().elements;
    expect(basicsElements.map((element) => element.id)).toEqual([
      "particle-preview-bg",
      "particle-preview",
    ]);

    await showFormTab(page, "source");
    const editElements = page.lastRender().elements;
    expect(editElements.map((element) => element.id)).toEqual([
      "particle-preview-bg",
      "particle-preview",
      "selected-border",
    ]);

    await showFormTab(page, "movement");
    expect(page.lastRender().elements).toEqual(basicsElements);

    await showFormTab(page, "source");
    expect(page.view()).toMatchObject({
      rightPanelEditStyle: "",
      rightPanelPreviewStyle: "display: none;",
      showSavePreviewButton: false,
    });

    await showPreviewTab(page);

    expect(page.view()).toMatchObject({
      rightPanelEditStyle: "display: none;",
      rightPanelPreviewStyle: "",
      showSavePreviewButton: true,
    });
    expect(page.lastRender().elements).toEqual(editElements.slice(0, 2));
  });

  it("moves the source only while the Source tab shows its outline", async () => {
    const page = await createPage();

    await page.drag([
      [150, 60],
      [190, 90],
    ]);

    expect(page.effect().modules.emission.source.data).toMatchObject({
      x: 100,
      y: 50,
    });
    expect(page.state().editHistory.undo).toHaveLength(0);
  });

  it("moves the source by dragging its outline, as one undo step per drag", async () => {
    const page = await createPage();
    await showFormTab(page, "source");

    await page.drag([
      [150, 60],
      [170, 70],
      [190, 90],
    ]);

    expect(page.effect().modules.emission.source).toEqual({
      kind: "rect",
      data: { x: 140, y: 80, width: 200, height: 40 },
    });
    expect(
      page.findElement(page.lastRender().elements, "selected-border"),
    ).toMatchObject({ x: 144, y: 84 });
    expect(page.view().formValues).toMatchObject({
      sourceX: "140",
      sourceY: "80",
    });

    await page.drag([
      [150, 60],
      [160, 60],
    ]);
    expect(page.effect().modules.emission.source.data.x).toBe(150);
    expect(page.state().editHistory.undo).toHaveLength(2);

    await handleUndoButtonClick(page.deps);
    expect(page.effect().modules.emission.source.data).toMatchObject({
      x: 140,
      y: 80,
    });
    await handleUndoButtonClick(page.deps);
    expect(page.effect().modules.emission.source.data).toMatchObject({
      x: 100,
      y: 50,
    });
  });

  it("moves both ends of a line source", async () => {
    const item = createSavedParticle();
    item.modules.emission.source = {
      kind: "line",
      data: { x1: 100, y1: 200, x2: 300, y2: 200 },
    };
    const page = await createPage({ item });
    await showFormTab(page, "source");
    // A straight line still gets an outline the minimum size thick.
    expect(
      page.findElement(page.lastRender().elements, "selected-border"),
    ).toMatchObject({ x: 104, y: 188, width: 192, height: 24 });

    await page.drag([
      [200, 200],
      [210, 180],
    ]);

    expect(page.effect().modules.emission.source.data).toEqual({
      x1: 110,
      y1: 180,
      x2: 310,
      y2: 180,
    });
    expect(page.state().editHistory.undo).toHaveLength(1);
  });

  it("draws a source above the canvas along its top edge", async () => {
    const snow = createParticlePreset({
      presetId: "snow",
      projectResolution: { width: 640, height: 360 },
    });
    const page = await createPage({
      item: { ...createSavedParticle(), modules: snow.modules },
    });
    await showFormTab(page, "source");

    expect(
      page.findElement(page.lastRender().elements, "selected-border"),
    ).toMatchObject({ x: 4, y: 4, width: 632, height: 24 });
  });

  it("switches sub-tabs and shows each tab's fields", async () => {
    const page = await createPage();

    await showFormTab(page, "source");

    expect(page.view().formTab).toBe("source");
    expect(page.view().particleForm.fields.map((field) => field.name)).toEqual(
      expect.arrayContaining(["sourceKind", "sourceX", "sourceY"]),
    );
  });

  it("releases the shared renderer before it saves on leaving", async () => {
    const page = await createPage();
    await page.changeField("emissionRate", 30);
    const order = [];
    page.deps.graphicsService.destroy.mockImplementation(async () => {
      order.push("destroy");
    });
    page.deps.projectService.updateParticle.mockImplementation(async () => {
      order.push("save");
      return { valid: true };
    });

    const cleaning = page.cleanup();
    expect(page.deps.graphicsService.destroy).toHaveBeenCalledOnce();
    await cleaning;

    expect(order).toEqual(["destroy", "save"]);
  });

  it("shows the panel under the canvas on a phone", async () => {
    const page = await createPage({ uiConfig: { id: "touch" } });
    await page.resizeWindow({ width: 390, height: 844 });

    expect(page.view()).toMatchObject({
      showExplorerPanel: false,
      showRightPanel: false,
      showMobilePanels: true,
      showCanvasZoomControls: false,
      showImageSelectorFileExplorer: false,
      canvasBackgroundStyle: "",
    });
    expect(page.view().canvasWrapperStyle).toContain("position: relative;");
  });

  it("keeps the panel on the right in tablet landscape, and moves it under the canvas in portrait", async () => {
    const page = await createPage({ uiConfig: { id: "touch" } });
    await page.resizeWindow({ width: 1133, height: 744 });

    expect(page.view()).toMatchObject({
      showRightPanel: true,
      showMobilePanels: false,
      showCanvasZoomControls: true,
    });
    const rendersBefore = page.deps.graphicsService.render.mock.calls.length;

    await page.resizeWindow({ width: 744, height: 1133 });

    expect(page.view()).toMatchObject({
      showRightPanel: false,
      showMobilePanels: true,
    });
    // The canvas redraws, so the outline fits the new canvas size.
    expect(page.deps.graphicsService.render.mock.calls.length).toBeGreaterThan(
      rendersBefore,
    );
  });
});
