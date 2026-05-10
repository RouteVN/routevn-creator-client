import { describe, expect, it, vi } from "vitest";
import {
  createInitialState,
  setFormValues,
} from "../../src/components/commandLineScreen/commandLineScreen.store.js";
import { handleSubmitClick } from "../../src/components/commandLineScreen/commandLineScreen.handlers.js";

describe("commandLineScreen.handlers", () => {
  it("submits a screen animation payload", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();

    setFormValues(
      { state },
      {
        values: {
          transitionAnimationId: "screen-crossfade",
        },
      },
    );

    handleSubmitClick({
      appService: {
        showAlert: vi.fn(),
      },
      dispatchEvent,
      store: {
        getState: () => state,
      },
    });

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      screen: {
        animations: {
          resourceId: "screen-crossfade",
        },
      },
    });
  });

  it("shows an alert when no transition animation is selected", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();
    const showAlert = vi.fn();

    handleSubmitClick({
      appService: {
        showAlert,
      },
      dispatchEvent,
      store: {
        getState: () => state,
      },
    });

    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith({
      message: "Please select a transition animation",
      title: "Warning",
    });
  });
});
