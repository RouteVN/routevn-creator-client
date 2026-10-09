import { produce } from "immer";
import { Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import * as transformEditorStore from "../../src/pages/transformEditor/transformEditor.store.js";
import {
  handleAfterMount,
  handleBackClick,
  handleBeforeMount,
  handleCanvasZoomInClick,
  handleCharacterSpriteConfirmClick,
  handleCharacterSpriteDialogClose,
  handleCharacterSpriteSelectionChange,
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
  handleUndoButtonClick,
} from "../../src/pages/transformEditor/transformEditor.handlers.js";
import { createTransformThumbnailSource } from "../../src/internal/transformPreview.js";
import { EN_I18N } from "../support/i18n.js";

// Edits save on their own 300ms after the last one.
const AUTOSAVE_WAIT_MS = 400;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const slotEvent = (slot) => ({
  _event: { currentTarget: { dataset: { slot } } },
});

const transformValues = {
  x: 960,
  y: 540,
  scaleX: 1,
  scaleY: 1,
  anchorX: 0.5,
  anchorY: 0.5,
  rotation: 0,
};

const savedTransform = {
  id: "transform-1",
  type: "transform",
  name: "Transform One",
  ...transformValues,
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

// A character drawn with a body and a face, the face on top.
const charactersData = {
  tree: [{ id: "character-1" }],
  items: {
    "character-1": {
      id: "character-1",
      type: "character",
      name: "Character One",
      spriteGroups: [
        { id: "body", name: "Body", tags: ["tag-body"] },
        { id: "face", name: "Face", tags: ["tag-face"] },
      ],
      sprites: {
        tree: [{ id: "sprite-body" }, { id: "sprite-smile" }],
        items: {
          "sprite-body": {
            id: "sprite-body",
            type: "image",
            name: "Body",
            fileId: "file-body",
            width: 800,
            height: 1200,
            tagIds: ["tag-body"],
          },
          "sprite-smile": {
            id: "sprite-smile",
            type: "image",
            name: "Smile",
            fileId: "file-smile",
            width: 800,
            height: 1000,
            tagIds: ["tag-face"],
          },
        },
      },
    },
  },
};

const characterTarget = {
  characterId: "character-1",
  sprites: [
    { id: "body", resourceId: "sprite-body" },
    { id: "face", resourceId: "sprite-smile" },
  ],
};

const sizeContainer = (element) => {
  if (element.type !== "container") {
    return element;
  }
  const children = element.children.map(sizeContainer);
  return {
    ...element,
    children,
    width: Math.max(...children.map((child) => child.x + child.width)),
    height: Math.max(...children.map((child) => child.y + child.height)),
  };
};

// The page on its real store, opened on a saved transform. The canvas is
// 960 CSS pixels wide, so a CSS pixel is two canvas units.
const createPage = async ({ item = savedTransform, uiConfig = {} } = {}) => {
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
  const windowMetricsListeners = new Set();
  let beforeNavigation;
  const repositoryState = {
    project: { resolution: { width: 1920, height: 1080 } },
    images: imagesData,
    characters: charactersData,
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
    uiConfig,
    windowMetricsClient: {
      subscribe: (listener) => {
        windowMetricsListeners.add(listener);
        return () => windowMetricsListeners.delete(listener);
      },
    },
    refs: {
      canvas: { getBoundingClientRect: () => ({ width: 960 }) },
      canvasBackground: { centerContent: vi.fn() },
      transformInspector: { setTransientValues: vi.fn() },
    },
    graphicsService: {
      init: vi.fn(async () => {}),
      render: vi.fn(),
      // Parsing keeps the elements as they are, since the test elements
      // already have their sizes, and sizes a container from its children,
      // as route-graphics does.
      parse: vi.fn(({ elements }) => ({
        elements: elements.map(sizeContainer),
      })),
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
      requestTransformThumbnails: vi.fn(async () => {}),
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
    beforeNavigation: (payload) => beforeNavigation(payload),
    resizeWindow: async (metrics) => {
      windowMetricsListeners.forEach((listener) => listener(metrics));
      await flush();
    },
    savedData: () =>
      deps.projectService.updateTransform.mock.calls.map(([call]) => call),
  };
};

// The target card asks for an image or a character sprite first.
const chooseTargetKind = async (page, value) => {
  handlePreviewImageClick(page.deps, slotEvent("target"));
  await handlePreviewImageMenuItemClick(page.deps, {
    _event: { detail: { item: { value } } },
  });
};

const pickPreviewImage = async (page, slot, imageId) => {
  if (slot === "target") {
    await chooseTargetKind(page, "image");
  } else {
    handlePreviewImageClick(page.deps, slotEvent(slot));
  }
  await handleImageSelectorImageSelected(page.deps, {
    _event: { detail: { imageId } },
  });
  await handleImageSelectorConfirmClick(page.deps);
};

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

    // Going back has no transform to save or draw.
    await page.beforeNavigation();
    expect(page.savedData()).toEqual([]);
    expect(
      page.deps.projectService.requestTransformThumbnails,
    ).not.toHaveBeenCalled();
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
    // The inspector follows each move, not only the end of the drag.
    const { setTransientValues } = page.deps.refs.transformInspector;
    expect(setTransientValues.mock.calls).toEqual([
      [{ values: { x: 1010, y: 560, scaleX: 1, scaleY: 1 } }],
      [{ values: { x: 1040, y: 580, scaleX: 1, scaleY: 1 } }],
    ]);
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
    expect(
      page.deps.refs.transformInspector.setTransientValues,
    ).toHaveBeenLastCalledWith({
      values: { x: 960, y: 540, scaleX: 1.5, scaleY: 1.5 },
    });
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
    expect(
      page.deps.projectService.requestTransformThumbnails,
    ).not.toHaveBeenCalled();
  });

  it("saves waiting edits at once when it leaves, then asks for its thumbnail", async () => {
    const page = await createPage();
    await page.press("ArrowLeft");

    await handleBackClick(page.deps);

    expect(page.savedData().map(({ data }) => data.x)).toEqual([959]);
    expect(page.deps.appService.navigate).toHaveBeenCalledWith(
      "/project/transforms",
      { p: "project-1" },
      { historyMode: "replace" },
    );

    // Navigating runs the leave check, which has nothing left to save, and
    // has the thumbnail brought up to date in the background.
    await page.beforeNavigation();
    await wait(AUTOSAVE_WAIT_MS);
    expect(page.savedData()).toHaveLength(1);
    expect(
      page.deps.projectService.requestTransformThumbnails,
    ).toHaveBeenCalledWith({ transformIds: ["transform-1"] });
  });

  it("saves nothing when an edit is undone before it saves", async () => {
    const page = await createPage();
    await page.press("ArrowLeft");
    await page.press("z", { metaKey: true });

    await handleBackClick(page.deps);
    await wait(AUTOSAVE_WAIT_MS);

    expect(page.savedData()).toEqual([]);
  });

  it("saves picked preview images on their own, outside the undo history", async () => {
    const page = await createPage();

    await pickPreviewImage(page, "background", "image-1");
    expect(page.savedData()).toEqual([]);
    await wait(AUTOSAVE_WAIT_MS);

    expect(page.savedData()).toEqual([
      {
        transformId: "transform-1",
        data: { preview: { background: { imageId: "image-1" } } },
      },
    ]);
    expect(page.state().editHistory.undo).toHaveLength(0);
    // Saving the preview images leaves the thumbnail for later.
    expect(
      page.deps.projectService.requestTransformThumbnails,
    ).not.toHaveBeenCalled();
  });

  it("saves a removed preview image", async () => {
    const page = await createPage({
      item: { ...savedTransform, preview: { target: { imageId: "image-2" } } },
    });

    handlePreviewImageContextMenu(page.deps, {
      _event: {
        ...slotEvent("target")._event,
        clientX: 10,
        clientY: 20,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      },
    });
    await handlePreviewImageMenuItemClick(page.deps, {
      _event: { detail: { item: { value: "remove" } } },
    });
    await wait(AUTOSAVE_WAIT_MS);

    expect(page.savedData()).toEqual([
      { transformId: "transform-1", data: { preview: {} } },
    ]);
  });

  it("saves values and preview images together, and a pick only once it is OK'd", async () => {
    const page = await createPage();
    await page.press("ArrowLeft");
    // The canvas shows a pick at once, but it is not saved until OK.
    handlePreviewImageClick(page.deps, slotEvent("background"));
    await handleImageSelectorImageSelected(page.deps, {
      _event: { detail: { imageId: "image-1" } },
    });
    await wait(AUTOSAVE_WAIT_MS);

    expect(page.savedData().map(({ data }) => data)).toEqual([
      { ...transformValues, x: 959 },
    ]);

    await handleImageSelectorConfirmClick(page.deps);
    await page.press("ArrowLeft");
    await handleBackClick(page.deps);

    expect(page.savedData().map(({ data }) => data)).toEqual([
      { ...transformValues, x: 959 },
      {
        ...transformValues,
        x: 958,
        preview: { background: { imageId: "image-1" } },
      },
    ]);
  });

  it("leaves thumbnails to the background: opening asks for nothing", async () => {
    const page = await createPage();

    expect(
      page.deps.projectService.requestTransformThumbnails,
    ).not.toHaveBeenCalled();
    expect(page.savedData()).toEqual([]);
  });

  it("leaves without waiting for the thumbnail, after saving picked images", async () => {
    const page = await createPage();
    const { requestTransformThumbnails, updateTransform } =
      page.deps.projectService;
    // The thumbnail is still being drawn when the page has left.
    requestTransformThumbnails.mockReturnValue(new Promise(() => {}));
    await pickPreviewImage(page, "background", "image-1");

    await page.beforeNavigation({ path: "/project/transforms" });

    expect(page.savedData()).toEqual([
      {
        transformId: "transform-1",
        data: { preview: { background: { imageId: "image-1" } } },
      },
    ]);
    expect(requestTransformThumbnails).toHaveBeenCalledWith({
      transformIds: ["transform-1"],
    });
    expect(updateTransform.mock.invocationCallOrder[0]).toBeLessThan(
      requestTransformThumbnails.mock.invocationCallOrder[0],
    );
  });

  it("draws on its Preview tab exactly what the background thumbnail hashes", async () => {
    const repositoryState = {
      project: { resolution: { width: 1920, height: 1080 } },
      images: imagesData,
      characters: charactersData,
    };
    for (const preview of [
      { background: { imageId: "image-1" }, target: { imageId: "image-2" } },
      { background: { imageId: "image-2" }, target: characterTarget },
      // A deleted image draws the gray screen in both.
      { background: { imageId: "image-deleted" } },
    ]) {
      const item = { ...savedTransform, x: 700, scaleX: 1.5, preview };
      const page = await createPage({ item });
      await handleRightPanelModeChange(page.deps, {
        _event: { detail: { id: "preview" } },
      });

      expect(page.lastRender()).toEqual(
        createTransformThumbnailSource({ item, repositoryState }).renderState,
      );
    }
  });

  it("leaves a pick still in its picker unsaved when it leaves", async () => {
    const page = await createPage();
    handlePreviewImageClick(page.deps, slotEvent("background"));
    await handleImageSelectorImageSelected(page.deps, {
      _event: { detail: { imageId: "image-1" } },
    });

    await page.beforeNavigation({ path: "/project/transforms" });
    await page.cleanup();

    expect(page.savedData()).toEqual([]);
  });

  it("only saves for a backup, the background, or quitting, since the page stays open", async () => {
    const page = await createPage();
    await page.press("ArrowLeft");

    await page.beforeNavigation({ reason: "backup" });
    await page.beforeNavigation({ reason: "background" });
    await page.beforeNavigation({ reason: "quit" });

    expect(page.savedData().map(({ data }) => data.x)).toEqual([959]);
    expect(
      page.deps.projectService.requestTransformThumbnails,
    ).not.toHaveBeenCalled();
  });

  it("keeps drawing the canvas when a preview image fails to load, and warns once", async () => {
    const page = await createPage();
    failImageOneFile(page);

    await pickPreviewImage(page, "background", "image-1");
    await pickPreviewImage(page, "target", "image-2");

    const elements = page.lastRender().elements;
    // The background falls back to the gray screen; the target image and
    // the outline still draw.
    expect(page.findElement(elements, "transform-background")).toMatchObject({
      type: "rect",
    });
    expect(page.findElement(elements, "transform-target")).toMatchObject({
      type: "sprite",
      src: "file-2",
    });
    expect(page.findElement(elements, "selected-border")).toBeTruthy();
    expect(page.deps.appService.showAlert).toHaveBeenCalledOnce();
    expect(page.deps.appService.showAlert).toHaveBeenCalledWith({
      title: "Warning",
      message: expect.stringContaining("Images: Image One"),
    });

    // Edits, inspector previews, and zoom redraw without reading the file
    // again or warning again.
    await page.press("ArrowRight");
    await handleInspectorPreview(page.deps, {
      _event: {
        detail: {
          formValues: page.view().inspectorValues,
          name: "scaleX",
          value: 2,
        },
      },
    });
    await handleCanvasZoomInClick(page.deps);

    expect(page.transform().x).toBe(961);
    expect(
      page.findElement(page.lastRender().elements, "transform-target"),
    ).toMatchObject({ x: 961, scaleX: 2, src: "file-2" });
    expect(fileReads(page, "file-1")).toHaveLength(1);
    expect(page.deps.appService.showAlert).toHaveBeenCalledOnce();
    expect(page.deps.appService.showToast).not.toHaveBeenCalled();
  });

  it("releases the shared renderer before it saves on leaving", async () => {
    const page = await createPage();
    await page.press("ArrowLeft");
    const order = [];
    page.deps.graphicsService.destroy.mockImplementation(async () => {
      order.push("destroy");
    });
    page.deps.projectService.updateTransform.mockImplementation(async () => {
      order.push("save");
      return { valid: true };
    });

    const cleaning = page.cleanup();
    // Another page can start its renderer while the save runs.
    expect(page.deps.graphicsService.destroy).toHaveBeenCalledOnce();
    await cleaning;

    expect(order).toEqual(["destroy", "save"]);
    expect(page.savedData().map(({ data }) => data.x)).toEqual([959]);
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
    });

    await handleRightPanelModeChange(page.deps, {
      _event: { detail: { id: "preview" } },
    });

    expect(page.view()).toMatchObject({
      rightPanelMode: "preview",
      rightPanelEditStyle: "display: none;",
      rightPanelPreviewStyle: "",
    });
    // Preview is Edit without the outline, which is what the thumbnail shows.
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
    expect(
      page.deps.projectService.requestTransformThumbnails,
    ).not.toHaveBeenCalled();
  });

  it("previews picked images at once and saves them on their own", async () => {
    const page = await createPage();

    handlePreviewImageClick(page.deps, slotEvent("background"));
    await handleImageSelectorImageSelected(page.deps, {
      _event: { detail: { imageId: "image-1" } },
    });
    expect(
      page.findElement(page.lastRender().elements, "transform-background"),
    ).toMatchObject({ type: "sprite", src: "file-1" });
    await handleImageSelectorConfirmClick(page.deps);

    await chooseTargetKind(page, "image");
    await handleImageSelectorImageSelected(page.deps, {
      _event: { detail: { imageId: "image-2" } },
    });
    await handleImageSelectorDialogClose(page.deps);
    expect(
      page.view().previewImageSlots.map((slot) => slot.image?.name),
    ).toEqual(["Image One", undefined]);

    await chooseTargetKind(page, "image");
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

    await wait(AUTOSAVE_WAIT_MS);
    expect(page.savedData().map(({ data }) => data)).toEqual([
      { preview: { target: { imageId: "image-2" } } },
    ]);
    expect(page.state().editHistory.undo).toHaveLength(0);
  });

  it("asks whether the target is an image or a character sprite", async () => {
    const page = await createPage();

    handlePreviewImageClick(page.deps, slotEvent("target"));
    expect(page.view().previewImageMenu).toMatchObject({
      isOpen: true,
      slot: "target",
    });
    expect(
      page
        .view()
        .previewImageMenu.items.map(({ label, value }) => [label, value]),
    ).toEqual([
      ["Image", "image"],
      ["Character Sprite", "character-sprite"],
    ]);

    await handlePreviewImageMenuItemClick(page.deps, {
      _event: { detail: { item: { value: "character-sprite" } } },
    });
    expect(page.view().characterSpriteDialog).toEqual({
      open: true,
      characterId: undefined,
      sprites: [],
    });
    // Nothing is picked yet, so OK is disabled.
    expect(page.view().characterSpriteConfirmDisabled).toBe(true);
    await handleCharacterSpriteDialogClose(page.deps);

    // The background is always an image.
    handlePreviewImageClick(page.deps, slotEvent("background"));
    expect(page.view().previewImageMenu.isOpen).toBe(false);
    expect(page.view().imageSelectorDialog).toMatchObject({
      open: true,
      slot: "background",
    });
  });

  it("previews a picked character's sprites at once and saves them on their own", async () => {
    const page = await createPage();

    await chooseTargetKind(page, "character-sprite");
    await handleCharacterSpriteSelectionChange(page.deps, {
      _event: { detail: { selection: characterTarget } },
    });

    // As scenes draw a character: a container placed by the transform, its
    // sprites stacked from its corner, the first at the bottom.
    const target = page.findElement(
      page.lastRender().elements,
      "transform-target",
    );
    expect(target).toMatchObject({
      type: "container",
      x: 960,
      y: 540,
      anchorX: 0.5,
      anchorY: 0.5,
    });
    expect(target.children).toEqual([
      expect.objectContaining({
        type: "sprite",
        src: "file-body",
        x: 0,
        y: 0,
        width: 800,
        height: 1200,
      }),
      expect.objectContaining({
        type: "sprite",
        src: "file-smile",
        width: 800,
        height: 1000,
      }),
    ]);
    for (const fileId of ["file-body", "file-smile"]) {
      expect(page.deps.projectService.getFileContent).toHaveBeenCalledWith(
        fileId,
        { verifyImageIntegrity: true },
      );
    }

    // The outline goes around the stacked sprites.
    expect(page.state().selectedElementMetrics).toMatchObject({
      width: 800,
      height: 1200,
    });

    await handleCharacterSpriteConfirmClick(page.deps);
    expect(page.view().characterSpriteDialog.open).toBe(false);
    const [, targetCard] = page.view().previewImageSlots;
    expect(targetCard.image).toMatchObject({ name: "Character One" });
    expect(targetCard.image.layers.map((layer) => layer.itemId)).toEqual([
      "sprite-body",
      "sprite-smile",
    ]);

    await wait(AUTOSAVE_WAIT_MS);
    expect(page.savedData().map(({ data }) => data)).toEqual([
      { preview: { target: characterTarget } },
    ]);
  });

  it("puts the original target back when the character dialog is cancelled", async () => {
    const page = await createPage({
      item: { ...savedTransform, preview: { target: { imageId: "image-2" } } },
    });

    await chooseTargetKind(page, "character-sprite");
    await handleCharacterSpriteSelectionChange(page.deps, {
      _event: { detail: { selection: characterTarget } },
    });
    expect(
      page.findElement(page.lastRender().elements, "transform-target").type,
    ).toBe("container");

    await handleCharacterSpriteDialogClose(page.deps);
    expect(
      page.findElement(page.lastRender().elements, "transform-target"),
    ).toMatchObject({ type: "sprite", src: "file-2" });
    expect(page.state().previewSlots.target).toEqual({ imageId: "image-2" });
  });

  it("leaves out a character sprite that cannot load, and warns once", async () => {
    const page = await createPage();
    page.deps.projectService.getFileContent.mockImplementation(
      async (fileId) => {
        if (fileId === "file-smile") {
          throw new Error("File file-smile is missing.");
        }
        return { url: `blob:${fileId}`, type: "image/png" };
      },
    );

    await chooseTargetKind(page, "character-sprite");
    await handleCharacterSpriteSelectionChange(page.deps, {
      _event: { detail: { selection: characterTarget } },
    });
    await handleCharacterSpriteConfirmClick(page.deps);

    // The body still draws, and the outline with it.
    const elements = page.lastRender().elements;
    expect(
      page
        .findElement(elements, "transform-target")
        .children.map((child) => child.src),
    ).toEqual(["file-body"]);
    expect(page.findElement(elements, "selected-border")).toBeTruthy();
    expect(page.deps.appService.showAlert).toHaveBeenCalledOnce();
    expect(page.deps.appService.showAlert).toHaveBeenCalledWith({
      title: "Warning",
      message: expect.stringContaining("Smile"),
    });
  });

  it("opens with a saved character target", async () => {
    const page = await createPage({
      item: { ...savedTransform, preview: { target: characterTarget } },
    });
    expect(
      page.findElement(page.lastRender().elements, "transform-target").children,
    ).toHaveLength(2);

    await chooseTargetKind(page, "character-sprite");
    // The selector opens on the saved character and sprites.
    expect(page.view().characterSpriteDialog).toEqual({
      open: true,
      characterId: "character-1",
      sprites: characterTarget.sprites,
    });
    expect(page.view().characterSpriteConfirmDisabled).toBe(false);
  });

  it("applies the other scale a kept aspect ratio moves with the change, as one edit", async () => {
    const page = await createPage();

    await handleInspectorPreview(page.deps, {
      _event: {
        detail: { name: "scaleX", value: 1.5, linkedValues: { scaleY: 1.5 } },
      },
    });
    expect(
      page.findElement(page.lastRender().elements, "transform-target"),
    ).toMatchObject({ scaleX: 1.5, scaleY: 1.5 });

    await handleInspectorUpdate(page.deps, {
      _event: {
        detail: { name: "scaleX", value: 2, linkedValues: { scaleY: 2 } },
      },
    });
    expect(page.transform()).toMatchObject({ scaleX: 2, scaleY: 2 });
    expect(page.state().editHistory.undo).toHaveLength(1);
  });

  it("redraws the outline for the zoomed canvas", async () => {
    const page = await createPage();
    page.deps.refs.canvas.getBoundingClientRect = () => ({ width: 1920 });

    await handleCanvasZoomInClick(page.deps);

    expect(page.view().canvasZoomLabel).toBe("150%");
    expect(page.state().selectedElementMetrics.canvasUnitsPerCssPixel).toBe(1);
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

  it("keeps the panel on the right in tablet landscape, as the layout editor does", async () => {
    const page = await createPage({ uiConfig: { id: "touch" } });
    await page.resizeWindow({ width: 1133, height: 744 });

    expect(page.view()).toMatchObject({
      showExplorerPanel: false,
      showRightPanel: true,
      showMobilePanels: false,
      showCanvasZoomControls: true,
      showImageSelectorFileExplorer: false,
    });
    expect(page.view().canvasWrapperStyle).toContain("position: absolute;");
  });

  it("moves the panel under the canvas when a tablet turns to portrait", async () => {
    const page = await createPage({ uiConfig: { id: "touch" } });
    await page.resizeWindow({ width: 1133, height: 744 });
    const rendersBefore = page.deps.graphicsService.render.mock.calls.length;

    await page.resizeWindow({ width: 744, height: 1133 });

    expect(page.view()).toMatchObject({
      showRightPanel: false,
      showMobilePanels: true,
    });
    expect(page.deps.render).toHaveBeenCalled();
    // The canvas redraws, so the outline handles fit the new canvas size.
    expect(page.deps.graphicsService.render.mock.calls.length).toBeGreaterThan(
      rendersBefore,
    );
  });
});
