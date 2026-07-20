import { describe, expect, it, vi } from "vitest";
import {
  handleCanvasClick,
  handleCanvasDoubleClick,
  handleCanvasPointerDown,
  handleCanvasPointerMove,
  handleCanvasPointerUp,
} from "../../src/components/layoutEditorCanvas/layoutEditorCanvas.handlers.js";
import * as canvasStore from "../../src/components/layoutEditorCanvas/layoutEditorCanvas.store.js";

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
    setSelectionOccurrences: bindAction(canvasStore.setSelectionOccurrences),
    selectSelectionOccurrencesById: bindSelector(
      canvasStore.selectSelectionOccurrencesById,
    ),
    selectHoveredSelection: bindSelector(canvasStore.selectHoveredSelection),
    setHoveredSelection: bindAction(canvasStore.setHoveredSelection),
    clearHoveredSelection: bindAction(canvasStore.clearHoveredSelection),
    setSelectedOccurrence: bindAction(canvasStore.setSelectedOccurrence),
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
  };
};

const createDeps = ({ selectedItemId } = {}) => {
  const props = {
    selectedItemId,
    resolution: {
      width: 100,
      height: 100,
    },
  };
  const store = createStore(props);
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
    canvasUnitsPerCssPixel: 2,
  });

  return {
    props,
    store,
    refs: {
      canvas: {
        getBoundingClientRect: () => ({
          left: 0,
          top: 0,
          width: 100,
          height: 100,
        }),
      },
    },
    graphicsService: {
      hitTestElementBounds: vi.fn(createNestedContentHits),
      render: vi.fn(),
    },
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
});
