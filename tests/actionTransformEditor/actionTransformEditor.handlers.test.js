import { describe, expect, it, vi } from "vitest";
import {
  handleBackgroundPointerDown,
  handleDoneClick,
  handleInspectorUpdate,
  handleWindowKeyDown,
  handleWindowPointerMove,
  handleWindowPointerUp,
} from "../../src/components/actionTransformEditor/actionTransformEditor.handlers.js";

const BASE_TRANSFORM = {
  x: 100,
  y: 120,
  anchorX: 0.5,
  anchorY: 0.5,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  originX: 960,
  originY: 540,
};

describe("actionTransformEditor.handlers", () => {
  it("maps inspector anchor values back to the action transform", () => {
    const dispatchedEvents = [];

    handleInspectorUpdate(
      {
        props: {
          transform: BASE_TRANSFORM,
        },
        dispatchEvent: (event) => dispatchedEvents.push(event),
      },
      {
        _event: {
          detail: {
            name: "anchor",
            value: { x: 1, y: 0 },
            formValues: {
              ...BASE_TRANSFORM,
              anchor: { x: 1, y: 0 },
            },
          },
        },
      },
    );

    expect(dispatchedEvents).toHaveLength(1);
    expect(dispatchedEvents[0].type).toBe("transform-change");
    expect(dispatchedEvents[0].detail).toMatchObject({
      name: "anchor",
      value: { x: 1, y: 0 },
      transform: {
        anchorX: 1,
        anchorY: 0,
      },
    });
    expect(dispatchedEvents[0].detail.transform).not.toHaveProperty("anchor");
  });

  it("owns arrow-key movement while no editor input is focused", () => {
    const dispatchedEvents = [];
    const event = {
      key: "ArrowRight",
      shiftKey: true,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    handleWindowKeyDown(
      {
        props: {
          transform: BASE_TRANSFORM,
        },
        appService: {
          isInputFocused: vi.fn(() => false),
        },
        dispatchEvent: (nextEvent) => dispatchedEvents.push(nextEvent),
      },
      { _event: event },
    );

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(dispatchedEvents[0].detail.transform).toMatchObject({
      x: 110,
      y: 120,
    });
  });

  it("leaves arrow keys with a focused inspector input", () => {
    const dispatchEvent = vi.fn();
    const event = {
      key: "ArrowRight",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    handleWindowKeyDown(
      {
        props: {
          transform: BASE_TRANSFORM,
        },
        appService: {
          isInputFocused: vi.fn(() => true),
        },
        dispatchEvent,
      },
      { _event: event },
    );

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it("emits Done", () => {
    const dispatchedEvents = [];
    const deps = {
      dispatchEvent: (event) => dispatchedEvents.push(event),
    };

    handleDoneClick(deps, {
      _event: {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      },
    });

    expect(dispatchedEvents[0].type).toBe("done");
  });

  it("moves a background using canvas-scaled pointer deltas", () => {
    const dispatchedEvents = [];
    let drag;
    const store = {
      startBackgroundDrag: vi.fn((value) => {
        drag = value;
      }),
      selectBackgroundDrag: vi.fn(() => drag),
      stopBackgroundDrag: vi.fn(() => {
        drag = undefined;
      }),
      setBackgroundDragTransform: vi.fn(({ transform }) => {
        drag.currentTransform = transform;
      }),
      setBackgroundDragPreviewFrameId: vi.fn(({ frameId }) => {
        drag.previewFrameId = frameId;
      }),
    };
    const render = vi.fn();
    const setTransientValues = vi.fn();
    const deps = {
      props: {
        targetType: "background",
        transform: BASE_TRANSFORM,
        projectResolution: { width: 1920, height: 1080 },
      },
      store,
      refs: {
        transformInspector: {
          setTransientValues,
        },
      },
      render,
      dispatchEvent: (event) => dispatchedEvents.push(event),
    };

    handleBackgroundPointerDown(deps, {
      _event: {
        button: 0,
        isPrimary: true,
        pointerId: 4,
        clientX: 100,
        clientY: 200,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        currentTarget: {
          getBoundingClientRect: () => ({ width: 960, height: 540 }),
        },
      },
    });
    handleWindowPointerMove(deps, {
      _event: {
        pointerId: 4,
        clientX: 148.4,
        clientY: 227.2,
        preventDefault: vi.fn(),
      },
    });

    expect(dispatchedEvents[0].detail.transform).toMatchObject({
      x: 197,
      y: 174,
    });
    expect(dispatchedEvents[0].detail.transient).toBe(true);
    expect(dispatchedEvents[0].detail.startTransform).toMatchObject({
      x: 100,
      y: 120,
    });
    expect(setTransientValues).toHaveBeenCalledWith({
      values: {
        x: 197,
        y: 174,
      },
    });

    handleWindowPointerUp(deps, {
      _event: {
        pointerId: 4,
      },
    });
    expect(dispatchedEvents[1].detail).toMatchObject({
      transient: false,
      transform: {
        x: 197,
        y: 174,
      },
    });
    expect(store.stopBackgroundDrag).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("coalesces background drag previews to the latest animation frame", () => {
    let scheduledFrame;
    const requestAnimationFrame = vi.fn((callback) => {
      scheduledFrame = callback;
      return 27;
    });
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);

    try {
      const dispatchedEvents = [];
      const drag = {
        pointerId: 4,
        startClientX: 100,
        startClientY: 200,
        canvasWidth: 960,
        canvasHeight: 540,
        projectResolution: { width: 1920, height: 1080 },
        transform: BASE_TRANSFORM,
        currentTransform: BASE_TRANSFORM,
        previewFrameId: undefined,
      };
      const setTransientValues = vi.fn();
      const deps = {
        store: {
          selectBackgroundDrag: vi.fn(() => drag),
          setBackgroundDragTransform: vi.fn(({ transform }) => {
            drag.currentTransform = transform;
          }),
          setBackgroundDragPreviewFrameId: vi.fn(({ frameId }) => {
            drag.previewFrameId = frameId;
          }),
        },
        refs: {
          transformInspector: {
            setTransientValues,
          },
        },
        dispatchEvent: (event) => dispatchedEvents.push(event),
      };

      handleWindowPointerMove(deps, {
        _event: {
          pointerId: 4,
          clientX: 120,
          clientY: 200,
          preventDefault: vi.fn(),
        },
      });
      handleWindowPointerMove(deps, {
        _event: {
          pointerId: 4,
          clientX: 170,
          clientY: 200,
          preventDefault: vi.fn(),
        },
      });

      expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
      expect(dispatchedEvents).toHaveLength(0);
      scheduledFrame();
      expect(dispatchedEvents).toHaveLength(1);
      expect(dispatchedEvents[0].detail.transform).toMatchObject({
        x: 240,
        y: 120,
      });
      expect(setTransientValues).toHaveBeenCalledWith({
        values: {
          x: 240,
          y: 120,
        },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
