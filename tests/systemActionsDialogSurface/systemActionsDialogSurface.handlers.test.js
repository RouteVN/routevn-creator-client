import { describe, expect, it } from "vitest";
import {
  handleDocumentKeyDown,
  handleSurfaceClose,
} from "../../src/components/systemActionsDialogSurface/systemActionsDialogSurface.handlers.js";

describe("systemActionsDialogSurface.handlers", () => {
  it("emits close from overlay interactions", () => {
    const dispatchedEvents = [];
    let stopPropagationCalled = false;
    let preventDefaultCalled = false;

    handleSurfaceClose(
      {
        dispatchEvent: (event) => dispatchedEvents.push(event),
      },
      {
        _event: {
          stopPropagation: () => {
            stopPropagationCalled = true;
          },
          preventDefault: () => {
            preventDefaultCalled = true;
          },
        },
      },
    );

    expect(stopPropagationCalled).toBe(true);
    expect(preventDefaultCalled).toBe(true);
    expect(dispatchedEvents).toHaveLength(1);
    expect(dispatchedEvents[0].type).toBe("close");
  });

  it("closes on Escape only while open", () => {
    const dispatchedEvents = [];
    let preventDefaultCalled = false;
    let stopPropagationCalled = false;

    handleDocumentKeyDown(
      {
        props: {
          open: true,
        },
        dispatchEvent: (event) => dispatchedEvents.push(event),
      },
      {
        _event: {
          key: "Escape",
          preventDefault: () => {
            preventDefaultCalled = true;
          },
          stopPropagation: () => {
            stopPropagationCalled = true;
          },
        },
      },
    );

    expect(preventDefaultCalled).toBe(true);
    expect(stopPropagationCalled).toBe(true);
    expect(dispatchedEvents).toHaveLength(1);
    expect(dispatchedEvents[0].type).toBe("close");

    handleDocumentKeyDown(
      {
        props: {
          open: false,
        },
        dispatchEvent: (event) => dispatchedEvents.push(event),
      },
      {
        _event: {
          key: "Escape",
        },
      },
    );

    expect(dispatchedEvents).toHaveLength(1);
  });
});
