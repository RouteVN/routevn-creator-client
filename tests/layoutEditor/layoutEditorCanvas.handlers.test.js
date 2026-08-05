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
    setPendingUpdatedItem: bindAction(canvasStore.setPendingUpdatedItem),
    clearPendingUpdatedItem: bindAction(canvasStore.clearPendingUpdatedItem),
    startDragging: bindAction(canvasStore.startDragging),
    stopDragging: bindAction(canvasStore.stopDragging),
    selectDragging: bindSelector(canvasStore.selectDragging),
    setDragStartPosition: bindAction(canvasStore.setDragStartPosition),
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

  it("does not render child hover chrome inside the selected parent", () => {
    const deps = createDeps({ selectedItemId: "parent" });

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

    expect(deps.store.selectHoveredSelection()).toBeUndefined();
    expect(deps.graphicsService.render).not.toHaveBeenCalled();
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

  it.each(["move", "right", "rotate"])(
    "suppresses hover previews during %s dragging",
    (dragMode) => {
      const deps = createDeps({ selectedItemId: "parent" });
      deps.store.setHoveredSelection({
        selection: {
          itemId: "child",
          occurrenceId: "child",
          bounds: bounds(20, 20, 40, 40),
        },
      });
      deps.store.startDragging({ dragMode });

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

      expect(deps.store.selectHoveredSelection()).toBeUndefined();
      expect(deps.graphicsService.hitTestElementBounds).not.toHaveBeenCalled();
    },
  );

  it("ignores a queued hover update after dragging starts", () => {
    let runFrame;
    vi.stubGlobal("requestAnimationFrame", (callback) => {
      runFrame = callback;
      return 1;
    });
    const deps = createDeps({ selectedItemId: "parent" });

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
    deps.store.startDragging({ dragMode: "move" });
    runFrame();

    expect(deps.store.selectHoveredSelection()).toBeUndefined();
    expect(deps.graphicsService.hitTestElementBounds).not.toHaveBeenCalled();
  });

  it.each(["before", "after"])(
    "does not turn a renderer drag that starts %s wrapper pointerdown into a parent click",
    (dragStartOrder) => {
      const deps = createDeps({ selectedItemId: "child" });
      const pointerEvent = {
        button: 0,
        isPrimary: true,
        pointerId: 1,
        pointerType: "mouse",
        clientX: 30,
        clientY: 30,
        metaKey: false,
        ctrlKey: false,
        detail: 1,
      };

      if (dragStartOrder === "before") {
        deps.store.startDragging({ dragMode: "move" });
      }
      handleCanvasPointerDown(deps, { _event: pointerEvent });
      if (dragStartOrder === "after") {
        deps.store.startDragging({ dragMode: "move" });
      }
      handleCanvasPointerMove(deps, {
        _event: {
          ...pointerEvent,
          clientX: 40,
          clientY: 40,
        },
      });
      deps.store.stopDragging();
      handleCanvasPointerUp(deps, { _event: pointerEvent });
      handleCanvasClick(deps, { _event: pointerEvent });

      expect(deps.store.selectPointerGesture()).toBeUndefined();
      expect(deps.store.selectPendingClickGesture()).toBeUndefined();
      expect(deps.dispatchEvent).not.toHaveBeenCalled();
    },
  );

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

  it("keeps the selected parent on a single click over its child", () => {
    const deps = createDeps({ selectedItemId: "parent" });
    deps.graphicsService.hitTestElementBounds.mockReturnValue([
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
    ]);

    runClick(deps);

    expect(deps.dispatchEvent.mock.calls[0][0].detail).toEqual({
      itemId: "parent",
      occurrenceId: "parent",
    });
  });

  it("drags the selected parent when the pointer starts over its child", async () => {
    const deps = createDeps({ selectedItemId: "parent" });
    deps.store.setHoveredSelection({
      selection: {
        itemId: "child",
        occurrenceId: "child",
        bounds: bounds(20, 20, 40, 40),
      },
    });
    const currentTarget = {
      setPointerCapture: vi.fn(),
    };
    const pointerEvent = {
      button: 0,
      isPrimary: true,
      pointerId: 1,
      pointerType: "mouse",
      currentTarget,
      clientX: 30,
      clientY: 30,
      metaKey: false,
      ctrlKey: false,
    };

    handleCanvasPointerDown(deps, { _event: pointerEvent });
    await handleCanvasPointerMove(deps, {
      _event: {
        ...pointerEvent,
        clientX: 40,
        clientY: 35,
      },
    });

    expect(deps.store.selectPointerGesture()).toMatchObject({
      directDragItemId: "parent",
    });
    expect(deps.store.selectPendingUpdatedItem()).toMatchObject({
      id: "parent",
      x: 10,
      y: 5,
    });
  });

  it("renders drag previews from cached canvas state", async () => {
    const deps = createDeps({ selectedItemId: "parent" });
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
    deps.store.setCanvasRenderState({
      elements: parsedElements,
      baseElements: parsedElements,
      parsedElements,
      canvasUnitsPerCssPixel: 1,
    });
    deps.graphicsService.render.mockClear();
    deps.projectService.ensureRepository.mockClear();
    const currentTarget = {
      setPointerCapture: vi.fn(),
    };
    const pointerEvent = {
      button: 0,
      isPrimary: true,
      pointerId: 1,
      pointerType: "mouse",
      currentTarget,
      clientX: 30,
      clientY: 30,
      metaKey: false,
      ctrlKey: false,
    };

    handleCanvasPointerDown(deps, { _event: pointerEvent });
    deps.graphicsService.render.mockClear();
    deps.projectService.ensureRepository.mockClear();
    await handleCanvasPointerMove(deps, {
      _event: {
        ...pointerEvent,
        clientX: 40,
        clientY: 35,
      },
    });

    expect(deps.projectService.ensureRepository).not.toHaveBeenCalled();
    expect(deps.graphicsService.render).toHaveBeenCalled();
    const lastRender = deps.graphicsService.render.mock.calls.at(-1)[0];
    expect(lastRender.elements[0]).toMatchObject({
      id: "parent",
      x: 10,
      y: 5,
    });
    expect(
      deps.dispatchEvent.mock.calls
        .map(([event]) => event)
        .find(({ type }) => type === "drag-update"),
    ).toMatchObject({
      detail: {
        itemId: "parent",
      },
    });
  });

  it("moves the selected item from its center after crossing the drag threshold", async () => {
    const deps = createDeps({ selectedItemId: "parent" });
    deps.graphicsService.hitTestElementBounds.mockReturnValue([
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
      {
        path: [
          {
            id: "parent",
            type: "container",
            bounds: bounds(0, 0, 100, 100),
          },
        ],
      },
    ]);
    const currentTarget = {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    };
    const pointerEvent = {
      button: 0,
      isPrimary: true,
      pointerId: 1,
      pointerType: "mouse",
      currentTarget,
      clientX: 30,
      clientY: 30,
      metaKey: false,
      ctrlKey: false,
    };

    handleCanvasPointerDown(deps, { _event: pointerEvent });
    await handleCanvasPointerMove(deps, {
      _event: {
        ...pointerEvent,
        clientX: 40,
        clientY: 35,
      },
    });

    expect(deps.store.selectPointerGesture()).toMatchObject({
      directDragItemId: "parent",
    });
    expect(deps.store.selectDragging()).toMatchObject({
      isDragging: true,
      dragMode: "move",
    });
    expect(currentTarget.setPointerCapture).toHaveBeenCalledWith(1);
  });

  it.each([
    {
      caseName: "moves the outermost parent before a hover indicator is shown",
      hoveredSelection: undefined,
      expectedItemId: "parent",
      expectedX: 10,
      expectedY: 5,
    },
    {
      caseName: "moves the child represented by the hover indicator",
      hoveredSelection: {
        itemId: "child",
        occurrenceId: "child",
        bounds: bounds(20, 20, 40, 40),
      },
      expectedItemId: "child",
      expectedX: 30,
      expectedY: 25,
    },
  ])(
    "$caseName",
    async ({ hoveredSelection, expectedItemId, expectedX, expectedY }) => {
      const deps = createDeps();
      deps.store.setHoveredSelection({ selection: hoveredSelection });
      const currentTarget = {
        setPointerCapture: vi.fn(),
        releasePointerCapture: vi.fn(),
      };
      const pointerEvent = {
        button: 0,
        isPrimary: true,
        pointerId: 1,
        pointerType: "mouse",
        currentTarget,
        clientX: 30,
        clientY: 30,
        metaKey: false,
        ctrlKey: false,
      };

      handleCanvasPointerDown(deps, { _event: pointerEvent });
      await handleCanvasPointerMove(deps, {
        _event: {
          ...pointerEvent,
          clientX: 40.25,
          clientY: 35.25,
        },
      });

      expect(deps.dispatchEvent.mock.calls[0][0]).toMatchObject({
        type: "selection-change",
        detail: {
          itemId: expectedItemId,
          occurrenceId: expectedItemId,
        },
      });
      expect(deps.store.selectPendingUpdatedItem()).toMatchObject({
        id: expectedItemId,
        x: expectedX,
        y: expectedY,
      });
      expect(deps.store.selectDragging()).toMatchObject({
        isDragging: true,
        dragMode: "move",
      });
      expect(currentTarget.setPointerCapture).toHaveBeenCalledWith(1);

      await handleCanvasPointerUp(deps, {
        _event: {
          ...pointerEvent,
          clientX: 40.25,
          clientY: 35.25,
        },
      });

      const canvasEvents = deps.dispatchEvent.mock.calls.map(
        ([event]) => event,
      );
      expect(
        canvasEvents.find(({ type }) => type === "drag-update"),
      ).toMatchObject({
        detail: {
          itemId: expectedItemId,
          updatedItem: expect.objectContaining({ x: expectedX, y: expectedY }),
        },
      });
      expect(canvasEvents.find(({ type }) => type === "update")).toMatchObject({
        detail: {
          itemId: expectedItemId,
          updatedItem: expect.objectContaining({ x: expectedX, y: expectedY }),
        },
      });
      expect(deps.store.selectDragging().isDragging).toBe(false);
      expect(currentTarget.releasePointerCapture).toHaveBeenCalledWith(1);
    },
  );

  it("deep-selects with Command and descends one level on double-click", () => {
    const deepDeps = createDeps();
    runClick(deepDeps, { metaKey: true });

    expect(deepDeps.dispatchEvent.mock.calls[0][0].detail).toMatchObject({
      itemId: "child",
    });

    const doubleClickDeps = createDeps({ selectedItemId: "parent" });
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

    const selectionEvents = doubleClickDeps.dispatchEvent.mock.calls
      .map(([event]) => event)
      .filter(({ type }) => type === "selection-change");
    expect(selectionEvents).toHaveLength(2);
    expect(selectionEvents[1].detail).toEqual({
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
    const rotationHandle = overlayChildren.find(
      ({ id }) => id === "selected-border-rotate",
    );
    expect(rotationHandle.width).toBe(32);
    expect(rotationHandle.cornerRadius).toBe(16);
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
