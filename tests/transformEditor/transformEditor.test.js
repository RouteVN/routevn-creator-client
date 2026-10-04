import { produce } from "immer";
import { Subject } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as transformEditorStore from "../../src/pages/transformEditor/transformEditor.store.js";
import {
  handleAfterMount,
  handleBackClick,
  handleBeforeMount,
  handleCanvasZoomInClick,
  handleImageSelectorConfirmClick,
  handleImageSelectorDialogClose,
  handleImageSelectorImageSelected,
  handleInspectorPreview,
  handleInspectorPreviewCancel,
  handleInspectorUpdate,
  handlePreviewImageClick,
  handlePreviewImageContextMenu,
  handlePreviewImageMenuItemClick,
  handleRedoButtonClick,
  handleRightPanelModeChange,
  handleSavePreviewClick,
  handleUndoButtonClick,
} from "../../src/pages/transformEditor/transformEditor.handlers.js";
import { captureTransformPreviewFiles } from "../../src/pages/transformEditor/support/transformEditorPreviewCapture.js";
import { EN_I18N } from "../support/i18n.js";

vi.mock(
  "../../src/pages/transformEditor/support/transformEditorPreviewCapture.js",
  () => ({ captureTransformPreviewFiles: vi.fn() }),
);

// Edits save on their own 300ms after the last one.
const AUTOSAVE_WAIT_MS = 400;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const slotEvent = (slot) => ({
  _event: { currentTarget: { dataset: { slot } } },
});

const savedTransform = {
  id: "transform-1",
  type: "transform",
  name: "Transform One",
  x: 960,
  y: 540,
  scaleX: 1,
  scaleY: 1,
  anchorX: 0.5,
  anchorY: 0.5,
  rotation: 0,
  thumbnailFileId: "thumb-1",
  previewFileId: "preview-1",
};

const imagesData = {
  tree: [{ id: "image-1" }, { id: "image-2" }],
  items: {
    "image-1": {
      id: "image-1",
      type: "image",
      name: "Image One",
      fileId: "file-1",
      width: 1920,
      height: 1080,
    },
    "image-2": {
      id: "image-2",
      type: "image",
      name: "Image Two",
      fileId: "file-2",
      width: 400,
      height: 600,
    },
  },
};

// The page on its real store, opened on a saved transform. The canvas is
// 960 CSS pixels wide, so a CSS pixel is two canvas units.
const createPage = async ({ item = savedTransform } = {}) => {
  let state = transformEditorStore.createInitialState();
  const store = new Proxy(
    {},
    {
      get: (_target, name) => (payload) => {
        if (name.startsWith("select")) {
          return transformEditorStore[name]({ state, i18n: EN_I18N }, payload);
        }
        let result;
        state = produce(state, (draft) => {
          result = transformEditorStore[name]({ state: draft }, payload);
        });
        return result;
      },
    },
  );
  const subject = new Subject();
  subject.dispatch = (action, payload) => subject.next({ action, payload });
  const windowListeners = {};
  let beforeNavigation;
  const repositoryState = {
    project: { resolution: { width: 1920, height: 1080 } },
    images: imagesData,
    transforms: {
      tree: [{ id: item.id }],
      items: { [item.id]: item },
    },
  };
  const deps = {
    store,
    subject,
    render: vi.fn(),
    i18n: EN_I18N,
    uiConfig: {},
    refs: {
      canvas: { getBoundingClientRect: () => ({ width: 960 }) },
      canvasBackground: { centerContent: vi.fn() },
    },
    graphicsService: {
      init: vi.fn(async () => {}),
      render: vi.fn(),
      // Parsing keeps the elements as they are: the test elements already
      // have their sizes.
      parse: vi.fn(({ elements }) => ({ elements })),
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
      getPayload: () => ({ p: "project-1", t: item.id }),
      navigate: vi.fn(),
      showAlert: vi.fn(),
      showToast: vi.fn(),
      isInputFocused: vi.fn(() => false),
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
      updateTransform: vi.fn(async () => ({ valid: true })),
    },
  };
  const cleanup = handleBeforeMount(deps);
  await handleAfterMount(deps);

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const lastRender = () => deps.graphicsService.render.mock.lastCall[0];
  const findElement = (elements, id) => {
    for (const element of elements ?? []) {
      if (element.id === id) {
        return element;
      }
      const child = findElement(element.children, id);
      if (child) {
        return child;
      }
    }
  };
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
  const drag = async (targetId, points) => {
    subject.dispatch("border-drag-start", { targetId });
    for (const [x, y] of points) {
      subject.dispatch("border-drag-move", { targetId, x, y });
    }
    subject.dispatch("border-drag-end", { targetId });
    await flush();
  };
  return {
    deps,
    store,
    cleanup,
    state: () => state,
    transform: () => state.transform,
    view: () => transformEditorStore.selectViewData({ state, i18n: EN_I18N }),
    lastRender,
    findElement,
    press,
    drag,
    flush,
    beforeNavigation: () => beforeNavigation(),
    savedData: () =>
      deps.projectService.updateTransform.mock.calls.map(([call]) => call),
  };
};

beforeEach(() => {
  captureTransformPreviewFiles.mockReset();
  captureTransformPreviewFiles.mockResolvedValue({
    previewFileId: "preview-2",
    thumbnailFileId: "thumb-2",
    fileRecords: [{ id: "record-1" }],
  });
});

describe("transform editor", () => {
  it("opens the transform with the selection outline on the canvas", async () => {
    const page = await createPage();
    const renderState = page.lastRender();
    const target = page.findElement(renderState.elements, "transform-target");

    expect(page.deps.graphicsService.init).toHaveBeenCalledWith({
      canvas: page.deps.refs.canvas,
      width: 1920,
      height: 1080,
    });
    expect(target).toMatchObject({
      type: "rect",
      x: 960,
      y: 540,
      scaleX: 1,
      scaleY: 1,
      anchorX: 0.5,
      anchorY: 0.5,
    });
    expect(page.findElement(renderState.elements, "selected-border")).toEqual(
      expect.objectContaining({ drag: expect.any(Object) }),
    );
    expect(
      page.findElement(renderState.elements, "selected-border-resize-right"),
    ).toBeTruthy();
    expect(page.state().selectedElementMetrics).toMatchObject({
      canvasUnitsPerCssPixel: 2,
      width: 200,
      height: 200,
    });
    expect(page.view()).toMatchObject({
      transformName: "Transform One",
      undoDisabled: true,
      redoDisabled: true,
      inspectorValues: { x: 960, y: 540, anchor: { x: 0.5, y: 0.5 } },
    });
  });

  it("alerts and goes back when the transform is missing", async () => {
    const page = await createPage({
      item: { ...savedTransform, id: "transform-1", type: "folder" },
    });

    expect(page.deps.appService.showAlert).toHaveBeenCalledWith({
      title: "Error",
      message: "Transform not found.",
    });
    expect(page.deps.appService.navigate).toHaveBeenCalledWith(
      "/project/transforms",
      { p: "project-1" },
      { historyMode: "replace" },
    );
  });

  it("moves the target by dragging its outline, as one undo step", async () => {
    const page = await createPage();

    await page.drag("selected-border", [
      [100, 100],
      [150, 120],
      [180, 140],
    ]);

    expect(page.transform()).toMatchObject({ x: 1040, y: 580 });
    expect(
      page.findElement(page.lastRender().elements, "transform-target"),
    ).toMatchObject({ x: 1040, y: 580 });
    expect(page.state().editHistory.undo).toHaveLength(1);

    await handleUndoButtonClick(page.deps);
    expect(page.transform()).toMatchObject({ x: 960, y: 540 });
    await handleRedoButtonClick(page.deps);
    expect(page.transform()).toMatchObject({ x: 1040, y: 580 });
  });

  it("scales the target evenly from an edge handle in 0.01 steps", async () => {
    const page = await createPage();

    // The right edge is 100 canvas units from the center anchor.
    await page.drag("selected-border-resize-right", [
      [1060, 540],
      [1110.3, 540],
    ]);

    expect(page.transform()).toMatchObject({ scaleX: 1.5, scaleY: 1.5 });
    expect(page.state().editHistory.undo).toHaveLength(1);
  });

  it("nudges with the arrow keys and undoes with the shortcut", async () => {
    const page = await createPage();

    const event = await page.press("ArrowRight");
    await page.press("ArrowRight", { shiftKey: true });
    await page.press("ArrowDown");

    expect(event.preventDefault).toHaveBeenCalled();
    expect(page.transform()).toMatchObject({ x: 971, y: 541 });

    await page.press("z", { metaKey: true });
    expect(page.transform()).toMatchObject({ x: 971, y: 540 });
    await page.press("z", { metaKey: true });
    expect(page.transform()).toMatchObject({ x: 960, y: 540 });
    await page.press("z", { metaKey: true, shiftKey: true });
    expect(page.transform()).toMatchObject({ x: 971, y: 540 });
  });

  it("leaves arrow keys to a focused field", async () => {
    const page = await createPage();
    page.deps.appService.isInputFocused.mockReturnValue(true);

    const event = await page.press("ArrowRight");

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(page.transform()).toMatchObject({ x: 960 });
  });

  it("applies the inspector field that changed, the anchor included", async () => {
    const page = await createPage();
    await page.press("ArrowRight");
    // The inspector's other values can be older than the canvas.
    const formValues = { ...page.view().inspectorValues, x: 960 };

    await handleInspectorUpdate(page.deps, {
      _event: { detail: { formValues, name: "rotation", value: 45 } },
    });
    await handleInspectorUpdate(page.deps, {
      _event: {
        detail: { formValues, name: "anchor", value: { x: 1, y: 0 } },
      },
    });

    expect(page.transform()).toMatchObject({
      x: 961,
      rotation: 45,
      anchorX: 1,
      anchorY: 0,
    });
    expect(page.state().editHistory.undo).toHaveLength(3);
  });

  it("previews an inspector field on the canvas until it is submitted", async () => {
    const page = await createPage();
    const formValues = { ...page.view().inspectorValues };

    await handleInspectorPreview(page.deps, {
      _event: { detail: { formValues, name: "scaleX", value: 2 } },
    });

    expect(
      page.findElement(page.lastRender().elements, "transform-target"),
    ).toMatchObject({ scaleX: 2 });
    expect(page.transform().scaleX).toBe(1);
    expect(page.state().editHistory.undo).toHaveLength(0);

    await handleInspectorPreviewCancel(page.deps);

    expect(
      page.findElement(page.lastRender().elements, "transform-target"),
    ).toMatchObject({ scaleX: 1 });
  });

  it("saves edits on their own a moment after", async () => {
    const page = await createPage();
    await page.press("ArrowLeft");
    await page.press("ArrowLeft");

    expect(page.savedData()).toEqual([]);
    await wait(AUTOSAVE_WAIT_MS);

    expect(page.savedData()).toEqual([
      {
        transformId: "transform-1",
        data: {
          x: 958,
          y: 540,
          scaleX: 1,
          scaleY: 1,
          anchorX: 0.5,
          anchorY: 0.5,
          rotation: 0,
        },
      },
    ]);
    expect(captureTransformPreviewFiles).not.toHaveBeenCalled();
  });

  it("saves waiting edits at once when it leaves", async () => {
    const page = await createPage();
    await page.press("ArrowLeft");

    await handleBackClick(page.deps);

    expect(page.savedData().map(({ data }) => data.x)).toEqual([959]);
    expect(page.deps.appService.navigate).toHaveBeenCalledWith(
      "/project/transforms",
      { p: "project-1" },
      { historyMode: "replace" },
    );

    await page.beforeNavigation();
    await wait(AUTOSAVE_WAIT_MS);
    expect(page.savedData()).toHaveLength(1);
  });

  it("saves nothing when an edit is undone before it saves", async () => {
    const page = await createPage();
    await page.press("ArrowLeft");
    await page.press("z", { metaKey: true });

    await handleBackClick(page.deps);
    await wait(AUTOSAVE_WAIT_MS);

    expect(page.savedData()).toEqual([]);
  });

  it("leaves unsaved preview images behind, as the layout editor does", async () => {
    const page = await createPage();
    handlePreviewImageClick(page.deps, slotEvent("background"));
    await handleImageSelectorImageSelected(page.deps, {
      _event: { detail: { imageId: "image-1" } },
    });
    await handleImageSelectorConfirmClick(page.deps);

    await handleBackClick(page.deps);

    expect(page.savedData()).toEqual([]);
    expect(page.deps.appService.navigate).toHaveBeenCalled();
  });

  it("saves the preview images and a new preview with Save Preview", async () => {
    const page = await createPage();
    await page.press("ArrowLeft");
    handlePreviewImageClick(page.deps, slotEvent("background"));
    await handleImageSelectorImageSelected(page.deps, {
      _event: { detail: { imageId: "image-1" } },
    });
    await handleImageSelectorConfirmClick(page.deps);
    await handleRightPanelModeChange(page.deps, {
      _event: { detail: { id: "preview" } },
    });

    await handleSavePreviewClick(page.deps);

    const [{ renderState }] = captureTransformPreviewFiles.mock.calls[0];
    expect(page.findElement(renderState.elements, "selected-border")).toBe(
      undefined,
    );
    expect(renderState.elements.map((element) => element.id)).toEqual([
      "transform-background",
      "transform-target",
    ]);
    const savedTarget = page.findElement(
      renderState.elements,
      "transform-target",
    );
    // The default target is a solid white square.
    expect(savedTarget).toMatchObject({ x: 959, fill: "white" });
    expect(savedTarget.alpha).toBeUndefined();
    expect(page.savedData()).toEqual([
      {
        transformId: "transform-1",
        data: expect.objectContaining({ x: 959 }),
      },
      {
        transformId: "transform-1",
        data: {
          thumbnailFileId: "thumb-2",
          previewFileId: "preview-2",
          preview: { background: { imageId: "image-1" } },
        },
        fileRecords: [{ id: "record-1" }],
      },
    ]);
    expect(page.deps.appService.showToast).toHaveBeenCalledWith({
      message: "Transform preview saved.",
    });
  });

  it("alerts and saves no preview when the canvas cannot be captured", async () => {
    captureTransformPreviewFiles.mockResolvedValue(undefined);
    const page = await createPage();

    await handleSavePreviewClick(page.deps);

    expect(page.savedData()).toEqual([]);
    expect(page.deps.appService.showAlert).toHaveBeenCalledWith({
      title: "Error",
      message: "Failed to capture the transform preview.",
    });
    // The canvas shows the outline again after the capture.
    expect(
      page.findElement(page.lastRender().elements, "selected-border"),
    ).toBeTruthy();
  });

  it("draws the same canvas on both tabs, with the outline only on Edit", async () => {
    const page = await createPage();
    const editElements = page.lastRender().elements;
    const { originX, originY, ...editTarget } = page.findElement(
      editElements,
      "transform-target",
    );
    expect([originX, originY]).toEqual([100, 100]);
    expect(page.view()).toMatchObject({
      rightPanelMode: "edit",
      rightPanelEditStyle: "",
      rightPanelPreviewStyle: "display: none;",
      showSavePreviewButton: false,
    });

    await handleRightPanelModeChange(page.deps, {
      _event: { detail: { id: "preview" } },
    });

    expect(page.view()).toMatchObject({
      rightPanelMode: "preview",
      rightPanelEditStyle: "display: none;",
      rightPanelPreviewStyle: "",
      showSavePreviewButton: true,
    });
    // Preview is Edit without the outline, which is what Save Preview saves.
    expect(page.lastRender().elements).toEqual([editElements[0], editTarget]);
    // The target is not selected for nudges on the Preview tab.
    const event = await page.press("ArrowRight");
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(page.transform().x).toBe(960);

    await handleRightPanelModeChange(page.deps, {
      _event: { detail: { id: "edit" } },
    });
    expect(
      page.findElement(page.lastRender().elements, "selected-border"),
    ).toBeTruthy();
  });

  it("keeps the page open when the save fails", async () => {
    const page = await createPage();
    page.deps.projectService.updateTransform.mockResolvedValue({
      valid: false,
    });
    await page.press("ArrowUp");

    await handleBackClick(page.deps);

    expect(page.deps.appService.navigate).not.toHaveBeenCalled();
    await expect(page.beforeNavigation()).rejects.toThrow(
      "Failed to save transform before navigation.",
    );
  });

  it("previews picked images at once and saves them with Save Preview", async () => {
    const page = await createPage();

    handlePreviewImageClick(page.deps, slotEvent("background"));
    await handleImageSelectorImageSelected(page.deps, {
      _event: { detail: { imageId: "image-1" } },
    });
    expect(
      page.findElement(page.lastRender().elements, "transform-background"),
    ).toMatchObject({ type: "sprite", src: "file-1" });
    await handleImageSelectorConfirmClick(page.deps);

    handlePreviewImageClick(page.deps, slotEvent("target"));
    await handleImageSelectorImageSelected(page.deps, {
      _event: { detail: { imageId: "image-2" } },
    });
    await handleImageSelectorDialogClose(page.deps);
    expect(
      page.view().previewImageSlots.map((slot) => slot.image?.name),
    ).toEqual(["Image One", undefined]);

    handlePreviewImageClick(page.deps, slotEvent("target"));
    await handleImageSelectorImageSelected(page.deps, {
      _event: { detail: { imageId: "image-2" } },
    });
    await handleImageSelectorConfirmClick(page.deps);
    expect(
      page.findElement(page.lastRender().elements, "transform-target"),
    ).toMatchObject({ type: "sprite", src: "file-2", width: 400, height: 600 });
    expect(page.deps.graphicsService.loadAssets).toHaveBeenCalledTimes(2);

    handlePreviewImageContextMenu(page.deps, {
      _event: {
        ...slotEvent("background")._event,
        clientX: 10,
        clientY: 20,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      },
    });
    await handlePreviewImageMenuItemClick(page.deps, {
      _event: { detail: { item: { value: "remove" } } },
    });

    await handleSavePreviewClick(page.deps);
    expect(page.savedData()[0].data.preview).toEqual({
      target: { imageId: "image-2" },
    });
    expect(page.state().editHistory.undo).toHaveLength(0);
  });

  it("redraws the outline for the zoomed canvas", async () => {
    const page = await createPage();
    page.deps.refs.canvas.getBoundingClientRect = () => ({ width: 1920 });

    await handleCanvasZoomInClick(page.deps);

    expect(page.view().canvasZoomLabel).toBe("150%");
    expect(page.state().selectedElementMetrics.canvasUnitsPerCssPixel).toBe(1);
  });

  it("shows the touch layout without side panels or the image folder list", async () => {
    const page = await createPage();
    page.store.setUiConfig({ uiConfig: { id: "touch" } });

    expect(page.view()).toMatchObject({
      isTouchMode: true,
      showExplorerPanel: false,
      showRightPanel: false,
      showCanvasZoomControls: false,
      showImageSelectorFileExplorer: false,
      canvasZoom: 1,
    });
  });
});
