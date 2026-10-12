import { describe, expect, it, vi } from "vitest";
import {
  handleBeforeMount,
  handleCanvasPointerCancel,
  handleCanvasZoomGesture,
  handleCanvasZoomInClick,
  handleCanvasZoomOutClick,
  handleCanvasZoomResetClick,
  handleDoneClick,
  handleInspectorPreview,
  handleInspectorPreviewCancel,
  handleInspectorUpdate,
  handleWindowKeyDown,
  setTransientTransform,
} from "../../src/components/actionTransformEditor/actionTransformEditor.handlers.js";
import { setTransientTransform as setTransientTransformMethod } from "../../src/components/actionTransformEditor/actionTransformEditor.methods.js";

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

// An event the editor sends to its owner.
const expectOwnerEvent = (event, type) => {
  expect(event.type).toBe(type);
  expect(event.bubbles).toBe(true);
  expect(event.composed).toBe(true);
  expect(event.detail).toEqual({});
};

// Deps for mounting the editor on a device that is, or is not, in touch
// landscape. The store keeps the flag it is given, as the real one does.
const createMountDeps = ({ isTouchLandscape }) => {
  const calls = [];
  const dispatchedEvents = [];
  const unsubscribe = vi.fn();
  const uiConfig = { id: "touch" };
  let storedTouchLandscape = false;
  let notifyTouchLandscape;
  const deps = {
    appService: {
      isTouchLandscape: vi.fn(() => isTouchLandscape),
      subscribeTouchLandscape: vi.fn((listener) => {
        calls.push("subscribe");
        notifyTouchLandscape = listener;
        return unsubscribe;
      }),
    },
    dispatchEvent: vi.fn((event) => {
      calls.push(event.type);
      dispatchedEvents.push(event);
    }),
    render: vi.fn(() => calls.push("render")),
    store: {
      setUiConfig: vi.fn(() => calls.push("setUiConfig")),
      setTouchLandscape: vi.fn(({ isTouchLandscape: next }) => {
        storedTouchLandscape = next;
        calls.push(`setTouchLandscape:${next}`);
      }),
      selectIsTouchLandscape: vi.fn(() => storedTouchLandscape),
    },
    uiConfig,
  };

  return {
    deps,
    calls,
    dispatchedEvents,
    unsubscribe,
    uiConfig,
    notifyTouchLandscape: (next) => notifyTouchLandscape(next),
  };
};

describe("actionTransformEditor.handlers", () => {
  it("follows touch landscape changes while mounted and returns the unsubscribe", () => {
    const {
      deps,
      calls,
      dispatchedEvents,
      unsubscribe,
      uiConfig,
      notifyTouchLandscape,
    } = createMountDeps({ isTouchLandscape: true });

    const cleanup = handleBeforeMount(deps);

    expect(deps.store.setUiConfig).toHaveBeenCalledWith({ uiConfig });
    expect(deps.appService.subscribeTouchLandscape).toHaveBeenCalledTimes(1);
    expect(cleanup).toBe(unsubscribe);
    expect(unsubscribe).not.toHaveBeenCalled();
    // The touch UI config is set first, then the layout the device is in is
    // stored, so the first render has it. Subscribing alone renders nothing.
    expect(calls.splice(0)).toEqual([
      "setUiConfig",
      "setTouchLandscape:true",
      "subscribe",
    ]);

    notifyTouchLandscape(false);
    notifyTouchLandscape(true);

    // Each flag is stored before the render that shows it. Moving the
    // inspector rebuilds it, which closes an open popover without a cancel, so
    // the owner is told to drop the preview, and then that the canvas changed
    // size.
    expect(calls).toEqual([
      "setTouchLandscape:false",
      "render",
      "transform-preview-cancel",
      "canvas-resize",
      "setTouchLandscape:true",
      "render",
      "transform-preview-cancel",
      "canvas-resize",
    ]);
    expect(deps.store.setTouchLandscape).toHaveBeenNthCalledWith(1, {
      isTouchLandscape: true,
    });
    expect(deps.store.setTouchLandscape).toHaveBeenNthCalledWith(2, {
      isTouchLandscape: false,
    });
    expect(deps.store.setTouchLandscape).toHaveBeenNthCalledWith(3, {
      isTouchLandscape: true,
    });
    expect(dispatchedEvents).toHaveLength(4);
    expectOwnerEvent(dispatchedEvents[0], "transform-preview-cancel");
    expectOwnerEvent(dispatchedEvents[1], "canvas-resize");
  });

  it("ignores a touch landscape notification that matches the layout it already has", () => {
    const { deps, notifyTouchLandscape } = createMountDeps({
      isTouchLandscape: false,
    });

    handleBeforeMount(deps);
    notifyTouchLandscape(false);

    // Only the mount stored the flag: a repeat neither renders nor cancels a
    // preview.
    expect(deps.store.setTouchLandscape).toHaveBeenCalledTimes(1);
    expect(deps.render).not.toHaveBeenCalled();
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
  });

  describe("canvas zoom", () => {
    const createCanvasDeps = () => {
      const calls = [];
      const dispatchedEvents = [];
      const track = (name) => vi.fn(() => calls.push(name));

      return {
        calls,
        dispatchedEvents,
        deps: {
          store: {
            zoomCanvasIn: track("zoomCanvasIn"),
            zoomCanvasOut: track("zoomCanvasOut"),
            resetCanvasZoom: track("resetCanvasZoom"),
            setCanvasZoom: track("setCanvasZoom"),
          },
          refs: {
            actionTransformCanvasBackground: {
              centerContent: track("centerContent"),
            },
          },
          render: track("render"),
          dispatchEvent: vi.fn((event) => {
            calls.push(event.type);
            dispatchedEvents.push(event);
          }),
        },
      };
    };

    // The owner draws the outline again once the render has given the canvas
    // its new size.
    it.each([
      [handleCanvasZoomInClick, "zoomCanvasIn"],
      [handleCanvasZoomOutClick, "zoomCanvasOut"],
    ])(
      "steps the zoom from a button, renders, then tells the owner the canvas changed size",
      (handler, action) => {
        const { deps, calls, dispatchedEvents } = createCanvasDeps();

        handler(deps);

        expect(calls).toEqual([action, "render", "canvas-resize"]);
        expect(dispatchedEvents).toHaveLength(1);
        expectOwnerEvent(dispatchedEvents[0], "canvas-resize");
      },
    );

    it("fits the canvas again and moves it to the middle before telling the owner", () => {
      const { deps, calls, dispatchedEvents } = createCanvasDeps();

      handleCanvasZoomResetClick(deps);

      expect(calls).toEqual([
        "resetCanvasZoom",
        "render",
        "centerContent",
        "canvas-resize",
      ]);
      expectOwnerEvent(dispatchedEvents[0], "canvas-resize");
    });

    it("stores the zoom a gesture ends on, renders, then tells the owner", () => {
      const { deps, calls, dispatchedEvents } = createCanvasDeps();

      handleCanvasZoomGesture(deps, { _event: { detail: { zoom: 2.37 } } });

      expect(deps.store.setCanvasZoom).toHaveBeenCalledWith({ zoom: 2.37 });
      expect(calls).toEqual(["setCanvasZoom", "render", "canvas-resize"]);
      expectOwnerEvent(dispatchedEvents[0], "canvas-resize");
    });
  });

  it("tells the owner to drop the drag a cancelled canvas pointer started", () => {
    const dispatchedEvents = [];

    handleCanvasPointerCancel({
      dispatchEvent: (event) => dispatchedEvents.push(event),
    });

    expect(dispatchedEvents).toHaveLength(1);
    expectOwnerEvent(dispatchedEvents[0], "canvas-drag-cancel");
  });

  it("shows the transform the canvas is dragging in the inspector without a render", () => {
    const setTransientValues = vi.fn();
    const render = vi.fn();

    setTransientTransform(
      {
        refs: { transformInspector: { setTransientValues } },
        render,
      },
      {
        transform: {
          ...BASE_TRANSFORM,
          x: 320,
          y: 180,
          scaleX: 1.5,
          scaleY: 1.25,
          rotation: 30,
        },
      },
    );

    // Only what a drag changes: the inspector keeps the rest.
    expect(setTransientValues).toHaveBeenCalledTimes(1);
    expect(setTransientValues).toHaveBeenCalledWith({
      values: { x: 320, y: 180, scaleX: 1.5, scaleY: 1.25 },
    });
    expect(render).not.toHaveBeenCalled();
  });

  it("exposes the transient transform as a component method", () => {
    const transformedHandlers = { setTransientTransform: vi.fn() };
    const transform = { ...BASE_TRANSFORM, x: 320 };

    setTransientTransformMethod.call({ transformedHandlers }, { transform });

    expect(transformedHandlers.setTransientTransform).toHaveBeenCalledWith({
      transform,
    });
  });

  it("maps inspector anchor values back to the action transform", () => {
    const dispatchedEvents = [];

    handleInspectorUpdate(
      {
        props: {
          transform: BASE_TRANSFORM,
          selectedElementMetrics: {
            width: 1920,
            height: 1080,
          },
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
        originX: 1920,
        originY: 0,
      },
    });
    expect(dispatchedEvents[0].detail.transform).not.toHaveProperty("anchor");
  });

  it("repairs a stale origin when another transform field changes", () => {
    const dispatchedEvents = [];

    handleInspectorUpdate(
      {
        props: {
          transform: {
            ...BASE_TRANSFORM,
            originX: 0,
            originY: 0,
          },
          selectedElementMetrics: {
            width: 400,
            height: 600,
          },
        },
        dispatchEvent: (event) => dispatchedEvents.push(event),
      },
      {
        _event: {
          detail: {
            name: "rotation",
            value: 20,
            formValues: {
              ...BASE_TRANSFORM,
              originX: 0,
              originY: 0,
              rotation: 20,
              anchor: { x: 0.5, y: 0.5 },
            },
          },
        },
      },
    );

    expect(dispatchedEvents[0].detail.transform).toMatchObject({
      rotation: 20,
      anchorX: 0.5,
      anchorY: 0.5,
      originX: 200,
      originY: 300,
    });
  });

  it("previews only the changed field over the current transform", () => {
    const dispatchedEvents = [];

    handleInspectorPreview(
      {
        props: {
          transform: {
            ...BASE_TRANSFORM,
            x: 300,
            y: 400,
            rotation: 15,
          },
          selectedElementMetrics: {
            width: 400,
            height: 600,
          },
        },
        dispatchEvent: (event) => dispatchedEvents.push(event),
      },
      {
        _event: {
          detail: {
            name: "scaleX",
            value: 1.5,
            // The inspector's other values can be older than the transform.
            formValues: {
              ...BASE_TRANSFORM,
              x: 5,
              y: 6,
              rotation: 90,
              scaleX: 1.5,
              originX: 0,
              originY: 0,
              anchor: { x: 0, y: 0 },
            },
          },
        },
      },
    );

    expect(dispatchedEvents).toHaveLength(1);
    expect(dispatchedEvents[0].type).toBe("transform-preview");
    expect(dispatchedEvents[0].bubbles).toBe(true);
    expect(dispatchedEvents[0].composed).toBe(true);
    expect(dispatchedEvents[0].detail).toEqual({
      transform: {
        x: 300,
        y: 400,
        anchorX: 0.5,
        anchorY: 0.5,
        scaleX: 1.5,
        scaleY: 1,
        rotation: 15,
        originX: 200,
        originY: 300,
      },
    });
  });

  it("previews the fields a change moves with it, such as the other scale", () => {
    const dispatchedEvents = [];

    handleInspectorPreview(
      {
        props: {
          transform: {
            ...BASE_TRANSFORM,
            x: 300,
            scaleX: 1,
            scaleY: 1,
          },
          selectedElementMetrics: {
            width: 1920,
            height: 1080,
          },
        },
        dispatchEvent: (event) => dispatchedEvents.push(event),
      },
      {
        _event: {
          detail: {
            name: "scaleX",
            value: 2,
            linkedValues: { scaleY: 2 },
            formValues: {
              ...BASE_TRANSFORM,
              x: 5,
              scaleX: 2,
              scaleY: 0.25,
              anchor: { x: 0.5, y: 0.5 },
            },
          },
        },
      },
    );

    expect(dispatchedEvents).toHaveLength(1);
    expect(dispatchedEvents[0].type).toBe("transform-preview");
    expect(dispatchedEvents[0].detail.transform).toMatchObject({
      x: 300,
      scaleX: 2,
      scaleY: 2,
    });
  });

  it("tells the owner when the inspector preview is cancelled", () => {
    const dispatchedEvents = [];

    handleInspectorPreviewCancel({
      dispatchEvent: (event) => dispatchedEvents.push(event),
    });

    expect(dispatchedEvents).toHaveLength(1);
    expect(dispatchedEvents[0].type).toBe("transform-preview-cancel");
    expect(dispatchedEvents[0].bubbles).toBe(true);
    expect(dispatchedEvents[0].composed).toBe(true);
    expect(dispatchedEvents[0].detail).toEqual({});
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
});
