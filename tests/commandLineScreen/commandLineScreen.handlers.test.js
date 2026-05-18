import { describe, expect, it, vi } from "vitest";
import {
  createInitialState,
  selectScreenBlur,
  selectScreenOpacity,
  selectTransitionAnimationId,
  setFormValues,
} from "../../src/components/commandLineScreen/commandLineScreen.store.js";
import { handleSubmitClick } from "../../src/components/commandLineScreen/commandLineScreen.handlers.js";

const createStoreApi = (state) => ({
  selectScreenBlur: () => selectScreenBlur({ state }),
  selectScreenOpacity: () => selectScreenOpacity({ state }),
  selectTransitionAnimationId: () => selectTransitionAnimationId({ state }),
  setFormValues: (payload) => setFormValues({ state }, payload),
});

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
      store: createStoreApi(state),
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

  it("submits screen opacity and blur without requiring an animation", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();

    setFormValues(
      { state },
      {
        values: {
          opacity: 0.5,
          blur: true,
          blurX: 6,
          blurY: 9,
          blurQuality: 3,
          blurKernelSize: 9,
          blurRepeatEdgePixels: true,
        },
      },
    );

    handleSubmitClick({
      appService: {
        showAlert: vi.fn(),
      },
      dispatchEvent,
      store: createStoreApi(state),
    });

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      screen: {
        opacity: 0.5,
        blur: {
          x: 6,
          y: 9,
          quality: 3,
          kernelSize: 9,
          repeatEdgePixels: true,
        },
      },
    });
  });

  it("omits screen opacity and blur when cleared", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();

    setFormValues(
      { state },
      {
        values: {
          transitionAnimationId: "screen-crossfade",
          opacity: undefined,
          blur: false,
        },
      },
    );

    handleSubmitClick({
      appService: {
        showAlert: vi.fn(),
      },
      dispatchEvent,
      store: createStoreApi(state),
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

  it("submits an empty screen action when no fields are selected", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();
    const showAlert = vi.fn();

    handleSubmitClick({
      appService: {
        showAlert,
      },
      dispatchEvent,
      store: createStoreApi(state),
    });

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      screen: {},
    });
    expect(showAlert).not.toHaveBeenCalled();
  });
});
