import { describe, expect, it, vi } from "vitest";
import {
  handleDoneClick,
  handleInspectorUpdate,
  handleWindowKeyDown,
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
