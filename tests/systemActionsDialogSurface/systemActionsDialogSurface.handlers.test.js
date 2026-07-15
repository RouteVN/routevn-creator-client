import { describe, expect, it } from "vitest";
import { handleSurfaceClose } from "../../src/components/systemActionsDialogSurface/systemActionsDialogSurface.handlers.js";

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

  it("emits a close request while close is suppressed", () => {
    const dispatchedEvents = [];
    let stopPropagationCalled = false;
    let preventDefaultCalled = false;

    handleSurfaceClose(
      {
        props: {
          suppressClose: true,
        },
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
    expect(dispatchedEvents[0].type).toBe("close-request");
  });
});
