import { Subject } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleBeforeMount,
  handleCanvasClick,
  handleCanvasDoubleClick,
  handleCanvasPointerDown,
  handleCanvasPointerMove,
  handleCanvasPointerUp,
  handleCanvasResize,
  handleOnUpdate,
} from "../../src/components/layoutEditorCanvas/layoutEditorCanvas.handlers.js";
import * as canvasStore from "../../src/components/layoutEditorCanvas/layoutEditorCanvas.store.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const bounds = (x, y, width, height) => ({
  x,
  y,
  width,
  height,
  corners: [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ],
});

const createNestedContentHits = () => [
  {
    path: [
      {
        id: "parent",
        type: "container",
        bounds: bounds(0, 0, 100, 100),
      },
      {
        id: "child",
        type: "rect",
        bounds: bounds(20, 20, 40, 40),
      },
    ],
  },
];

const createStore = (props) => {
  const state = canvasStore.createInitialState();
  const bindAction = (action) => (payload) => action({ state, props }, payload);
  const bindSelector = (selector) => (payload) =>
    selector({ state, props }, payload);

  return {
    state,
    setGraphicsReady: bindAction(canvasStore.setGraphicsReady),
    selectIsGraphicsReady: bindSelector(canvasStore.selectIsGraphicsReady),
    setActiveRenderRequestId: bindAction(canvasStore.setActiveRenderRequestId),
    selectActiveRenderRequestId: bindSelector(
      canvasStore.selectActiveRenderRequestId,
    ),
    setSelectionOccurrences: bindAction(canvasStore.setSelectionOccurrences),
    selectSelectionOccurrencesById: bindSelector(
      canvasStore.selectSelectionOccurrencesById,
    ),
    selectSelectionOccurrenceState: bindSelector(
      canvasStore.selectSelectionOccurrenceState,
    ),
    selectHoveredSelection: bindSelector(canvasStore.selectHoveredSelection),
    setHoveredSelection: bindAction(canvasStore.setHoveredSelection),
    clearHoveredSelection: bindAction(canvasStore.clearHoveredSelection),
    setSelectedOccurrence: bindAction(canvasStore.setSelectedOccurrence),
    selectSelectedOccurrenceId: bindSelector(
      canvasStore.selectSelectedOccurrenceId,
    ),
    clearSelectedOccurrence: bindAction(canvasStore.clearSelectedOccurrence),
    setPointerGesture: bindAction(canvasStore.setPointerGesture),
    selectPointerGesture: bindSelector(canvasStore.selectPointerGesture),
    clearPointerGesture: bindAction(canvasStore.clearPointerGesture),
    setPendingClickGesture: bindAction(canvasStore.setPendingClickGesture),
    selectPendingClickGesture: bindSelector(
      canvasStore.selectPendingClickGesture,
    ),
    clearPendingClickGesture: bindAction(canvasStore.clearPendingClickGesture),
    setDoubleClickSequence: bindAction(canvasStore.setDoubleClickSequence),
    selectDoubleClickSequence: bindSelector(
      canvasStore.selectDoubleClickSequence,
    ),
    clearDoubleClickSequence: bindAction(canvasStore.clearDoubleClickSequence),
    setLastPointerPosition: bindAction(canvasStore.setLastPointerPosition),
    selectLastPointerPosition: bindSelector(
      canvasStore.selectLastPointerPosition,
    ),
    clearLastPointerPosition: bindAction(canvasStore.clearLastPointerPosition),
    setDeepSelectActive: bindAction(canvasStore.setDeepSelectActive),
    selectDeepSelectActive: bindSelector(canvasStore.selectDeepSelectActive),
    selectResolvedSelectedOccurrenceId: bindSelector(
      canvasStore.selectResolvedSelectedOccurrenceId,
    ),
    setHoverFrameId: bindAction(canvasStore.setHoverFrameId),
    selectHoverFrameId: bindSelector(canvasStore.selectHoverFrameId),
    setCanvasRenderState: bindAction(canvasStore.setCanvasRenderState),
    selectCanvasRenderState: bindSelector(canvasStore.selectCanvasRenderState),
    selectPendingUpdatedItem: bindSelector(
      canvasStore.selectPendingUpdatedItem,
    ),
    clearPendingUpdatedItem: bindAction(canvasStore.clearPendingUpdatedItem),
    selectSelectedOccurrenceOwnerId: bindSelector(
      canvasStore.selectSelectedOccurrenceOwnerId,
    ),
    cacheFileContent: bindAction(canvasStore.cacheFileContent),
    selectCachedFileContent: bindSelector(canvasStore.selectCachedFileContent),
    clearCachedFileContent: bindAction(canvasStore.clearCachedFileContent),
    clearFileContentCache: bindAction(canvasStore.clearFileContentCache),
  };
};

const createDeps = ({ selectedItemId } = {}) => {
  const props = {
    selectedItemId,
    resolution: {
      width: 100,
      height: 100,
    },
    layoutState: {
      id: "layout-main",
      layoutType: "general",
      elements: {
        items: {
          parent: {
            type: "container",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          },
          child: {
            type: "rect",
            x: 20,
            y: 20,
            width: 40,
            height: 40,
          },
        },
        tree: [{ id: "parent", children: [{ id: "child" }] }],
      },
    },
    previewData: {},
  };
  const store = createStore(props);
  const canvasBounds = {
    left: 0,
    top: 0,
    width: 100,
    height: 100,
  };
  const baseElements = [{ id: "base", type: "rect", width: 100, height: 100 }];
  const parsedElements = [
    {
      id: "parent",
      type: "container",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [
        {
          id: "child",
          type: "rect",
          x: 20,
          y: 20,
          width: 40,
          height: 40,
        },
      ],
    },
  ];
  store.setGraphicsReady({ value: true });
  store.setSelectionOccurrences({
    occurrencesById: {
      parent: {
        ownerItemId: "parent",
        authoredPath: ["parent"],
      },
      child: {
        ownerItemId: "child",
        authoredPath: ["parent", "child"],
      },
    },
    occurrenceIdsByOwner: {
      parent: ["parent"],
      child: ["child"],
    },
  });
  store.setCanvasRenderState({
    elements: [
      { id: "base", type: "rect", width: 100, height: 100 },
      {
        id: "selected-border-group",
        type: "container",
        width: 100,
        height: 100,
        children: [],
      },
    ],
    baseElements,
    parsedElements,
    canvasUnitsPerCssPixel: 2,
  });

  return {
    props,
    store,
    refs: {
      canvas: {
        getBoundingClientRect: () => canvasBounds,
      },
    },
    graphicsService: {
      hitTestElementBounds: vi.fn(createNestedContentHits),
      render: vi.fn(),
      parse: vi.fn(({ elements }) => ({ elements })),
      waitUntilReady: vi.fn(),
      hasLoadedAsset: vi.fn(() => true),
      loadAssets: vi.fn(),
    },
    projectService: {
      ensureRepository: vi.fn(),
      getRepositoryState: vi.fn(() => ({
        layouts: { items: {} },
        images: { items: {} },
        textStyles: { items: {} },
        colors: { items: {} },
        fonts: { items: {} },
      })),
    },
    canvasBounds,
    dispatchEvent: vi.fn(),
    render: vi.fn(),
  };
};

const runClick = (deps, { clickCount = 1, metaKey = false } = {}) => {
  const event = {
    button: 0,
    isPrimary: true,
    pointerId: clickCount,
    clientX: 30,
    clientY: 30,
    metaKey,
    ctrlKey: false,
    detail: clickCount,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };

  handleCanvasPointerDown(deps, { _event: event });
  handleCanvasPointerUp(deps, { _event: event });
  handleCanvasClick(deps, { _event: event });

  return event;
};

describe("layoutEditorCanvas pointer selection", () => {
  it("renders hover with Route Graphics rects and a one-CSS-pixel light-gray line", () => {
    const deps = createDeps();

    handleCanvasPointerMove(deps, {
      _event: {
        pointerId: 1,
        clientX: 30,
        clientY: 30,
        metaKey: false,
        ctrlKey: false,
      },
    });

    const renderedElements =
      deps.graphicsService.render.mock.calls[0][0].elements;
    expect(renderedElements.map(({ id }) => id)).toEqual([
      "base",
      "hover-border-outer",
      "hover-border-inner",
      "selected-border-group",
    ]);
    expect(renderedElements[2].border).toMatchObject({
      color: "#b3b3b3",
      width: 2,
    });
  });

  it("tracks touch movement without rendering hover chrome", () => {
    const deps = createDeps();
    const pointerEvent = {
      button: 0,
      isPrimary: true,
      pointerId: 1,
      pointerType: "touch",
      clientX: 30,
      clientY: 30,
      metaKey: false,
      ctrlKey: false,
    };

    handleCanvasPointerDown(deps, { _event: pointerEvent });
    handleCanvasPointerMove(deps, {
      _event: {
        ...pointerEvent,
        clientX: 31,
      },
    });

    expect(deps.store.selectLastPointerPosition()).toMatchObject({
      clientX: 31,
      pointerType: "touch",
    });
    expect(deps.store.selectPointerGesture()).toMatchObject({
      pointerId: 1,
      moved: false,
    });
    expect(deps.store.selectHoveredSelection()).toBeUndefined();
    expect(deps.graphicsService.render).not.toHaveBeenCalled();
  });

  it("observes a normal click without consuming the authored gesture", () => {
    const deps = createDeps();
    const event = runClick(deps);

    expect(deps.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(deps.dispatchEvent.mock.calls[0][0].detail).toEqual({
      itemId: "parent",
      occurrenceId: "parent",
    });
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  it("deep-selects with Command and descends one level on double-click", () => {
    const deepDeps = createDeps();
    runClick(deepDeps, { metaKey: true });

    expect(deepDeps.dispatchEvent.mock.calls[0][0].detail).toMatchObject({
      itemId: "child",
    });

    const doubleClickDeps = createDeps();
    runClick(doubleClickDeps, { clickCount: 1 });
    doubleClickDeps.graphicsService.hitTestElementBounds.mockImplementationOnce(
      () => [
        {
          path: [
            {
              id: "selected-border-group",
              type: "container",
              bounds: bounds(0, 0, 100, 100),
            },
            {
              id: "selected-border",
              type: "rect",
              bounds: bounds(0, 0, 100, 100),
            },
          ],
        },
        ...createNestedContentHits(),
      ],
    );
    runClick(doubleClickDeps, { clickCount: 2 });
    handleCanvasDoubleClick(doubleClickDeps);

    expect(doubleClickDeps.dispatchEvent).toHaveBeenCalledTimes(2);
    expect(doubleClickDeps.dispatchEvent.mock.calls[1][0].detail).toEqual({
      itemId: "child",
      occurrenceId: "child",
    });
  });

  it("moves selection chrome when another occurrence of the selected item is clicked", () => {
    const deps = createDeps({ selectedItemId: "parent" });
    const repeatedElements = [
      {
        id: "parent-instance-0",
        type: "container",
        x: 0,
        y: 0,
        width: 20,
        height: 20,
      },
      {
        id: "parent-instance-1",
        type: "container",
        x: 60,
        y: 0,
        width: 20,
        height: 20,
      },
    ];
    deps.store.setSelectionOccurrences({
      occurrencesById: {
        "parent-instance-0": {
          ownerItemId: "parent",
          authoredPath: ["parent"],
        },
        "parent-instance-1": {
          ownerItemId: "parent",
          authoredPath: ["parent"],
        },
      },
      occurrenceIdsByOwner: {
        parent: ["parent-instance-0", "parent-instance-1"],
      },
    });
    deps.store.setCanvasRenderState({
      elements: repeatedElements,
      baseElements: repeatedElements,
      parsedElements: repeatedElements,
      canvasUnitsPerCssPixel: 1,
    });
    deps.graphicsService.hitTestElementBounds.mockReturnValue([
      {
        path: [
          {
            id: "parent-instance-1",
            type: "container",
            bounds: bounds(60, 0, 20, 20),
          },
        ],
      },
    ]);

    runClick(deps);

    const renderedElements =
      deps.graphicsService.render.mock.calls.at(-1)[0].elements;
    expect(deps.store.selectSelectedOccurrenceId()).toBe("parent-instance-1");
    expect(renderedElements.at(-1)).toMatchObject({
      id: "selected-border-group",
      x: 60,
      width: 20,
    });
    expect(deps.dispatchEvent.mock.calls.at(-1)[0].detail.metrics.id).toBe(
      "parent-instance-1",
    );
  });

  it("restores hover chrome after a full canvas render", async () => {
    const deps = createDeps();
    handleCanvasPointerMove(deps, {
      _event: {
        pointerId: 1,
        pointerType: "mouse",
        clientX: 30,
        clientY: 30,
        metaKey: false,
        ctrlKey: false,
      },
    });
    deps.graphicsService.render.mockClear();

    await handleOnUpdate(deps, {
      oldProps: deps.props,
      newProps: {
        ...deps.props,
        previewData: {
          changed: true,
        },
      },
    });

    const renderedElements =
      deps.graphicsService.render.mock.calls.at(-1)[0].elements;
    expect(renderedElements.map(({ id }) => id)).toContain(
      "hover-border-inner",
    );
    expect(deps.store.selectHoveredSelection()).toMatchObject({
      itemId: "parent",
      occurrenceId: "parent",
    });
  });

  it("rebuilds editor chrome with the current canvas CSS scale", () => {
    const deps = createDeps({ selectedItemId: "parent" });
    const { elements, baseElements, parsedElements } =
      deps.store.selectCanvasRenderState();
    deps.store.setCanvasRenderState({
      elements,
      baseElements,
      parsedElements,
      canvasUnitsPerCssPixel: 1,
    });
    deps.canvasBounds.width = 50;

    expect(handleCanvasResize(deps)).toBe(true);

    const renderedElements =
      deps.graphicsService.render.mock.calls.at(-1)[0].elements;
    const overlayChildren = renderedElements.at(-1).children;
    expect(
      overlayChildren.find(({ id }) => id === "selected-border-outer").border
        .width,
    ).toBe(2);
    expect(
      overlayChildren.find(({ id }) => id === "selected-border-inner").border
        .width,
    ).toBe(2);
    expect(
      overlayChildren.find(({ id }) => id === "selected-border-anchor").width,
    ).toBe(16);
    expect(deps.store.selectCanvasRenderState().canvasUnitsPerCssPixel).toBe(2);
  });

  it("observes canvas size changes and disconnects on unmount", () => {
    const deps = createDeps({ selectedItemId: "parent" });
    const frameCallbacks = [];
    const observe = vi.fn();
    const disconnect = vi.fn();
    let resizeCallback;
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("requestAnimationFrame", (callback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback) {
          resizeCallback = callback;
        }

        observe = observe;
        disconnect = disconnect;
      },
    );
    deps.appService = {
      isInputFocused: vi.fn(() => false),
    };
    deps.subject = new Subject();
    deps.graphicsService.destroy = vi.fn();
    const { elements, baseElements, parsedElements } =
      deps.store.selectCanvasRenderState();
    deps.store.setCanvasRenderState({
      elements,
      baseElements,
      parsedElements,
      canvasUnitsPerCssPixel: 1,
    });

    const cleanup = handleBeforeMount(deps);
    frameCallbacks.shift()();
    expect(observe).toHaveBeenCalledWith(deps.refs.canvas);

    deps.canvasBounds.width = 50;
    resizeCallback();
    frameCallbacks.shift()();
    expect(deps.graphicsService.render).toHaveBeenCalledTimes(1);

    cleanup();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
