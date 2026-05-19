import { describe, expect, it, vi } from "vitest";
import {
  createInitialState,
  selectScreenBlur,
  selectScreenBlurActionValue,
  selectScreenOpacity,
  selectTransitionAnimationId,
  setFormValues,
} from "../../src/components/commandLineScreen/commandLineScreen.store.js";
import {
  handleFormChange,
  handleSubmitClick,
} from "../../src/components/commandLineScreen/commandLineScreen.handlers.js";

const createStoreApi = (state) => ({
  selectScreenBlur: () => selectScreenBlur({ state }),
  selectScreenBlurActionValue: () => selectScreenBlurActionValue({ state }),
  selectScreenOpacity: () => selectScreenOpacity({ state }),
  selectTransitionAnimationId: () => selectTransitionAnimationId({ state }),
  setFormValues: (payload) => setFormValues({ state }, payload),
});

describe("commandLineScreen.handlers", () => {
  it("emits temporary presentation state when opacity and blur change", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();

    handleFormChange(
      {
        dispatchEvent,
        render,
        store: createStoreApi(state),
      },
      {
        _event: {
          detail: {
            values: {
              transitionAnimationId: "screen-crossfade",
              opacity: "0.5",
              blur: true,
              blurX: "8",
              blurY: 10,
              blurQuality: 4,
              blurKernelSize: 11,
              blurRepeatEdgePixels: false,
            },
          },
        },
      },
    );

    expect(render).toHaveBeenCalledTimes(1);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].type).toBe(
      "temporary-presentation-state-change",
    );
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      presentationState: {
        screen: {
          animations: {
            resourceId: "screen-crossfade",
          },
          opacity: 0.5,
          blur: {
            x: 8,
            y: 10,
            quality: 4,
            kernelSize: 11,
            repeatEdgePixels: false,
          },
        },
      },
    });
  });

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

  it("omits screen opacity and clears blur when disabled", () => {
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
        blur: null,
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
