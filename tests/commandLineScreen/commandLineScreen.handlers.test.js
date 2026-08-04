import { describe, expect, it, vi } from "vitest";
import {
  createInitialState,
  removeBlurOption,
  removeOpacityOption,
  selectBlurOptionEnabled,
  selectOpacityOptionEnabled,
  selectAnimationPlaybackContinuity,
  selectAnimationPlaybackSpeed,
  selectScreenBlur,
  selectScreenBlurActionValue,
  selectScreenOpacity,
  selectTransitionAnimationId,
  setFormValues,
  setScreenOptionVisibility,
  showBlurOption,
  showOpacityOption,
} from "../../src/components/commandLineScreen/commandLineScreen.store.js";
import {
  handleFormChange,
  handleOptionsSectionAction,
  handleSubmitClick,
} from "../../src/components/commandLineScreen/commandLineScreen.handlers.js";
import { EN_I18N } from "../support/i18n.js";

const createStoreApi = (state) => ({
  removeBlurOption: () => removeBlurOption({ state }),
  removeOpacityOption: () => removeOpacityOption({ state }),
  selectBlurOptionEnabled: () => selectBlurOptionEnabled({ state }),
  selectOpacityOptionEnabled: () => selectOpacityOptionEnabled({ state }),
  selectAnimationPlaybackContinuity: () =>
    selectAnimationPlaybackContinuity({ state }),
  selectAnimationPlaybackSpeed: () => selectAnimationPlaybackSpeed({ state }),
  selectScreenBlur: () => selectScreenBlur({ state }),
  selectScreenBlurActionValue: () => selectScreenBlurActionValue({ state }),
  selectScreenOpacity: () => selectScreenOpacity({ state }),
  selectTransitionAnimationId: () => selectTransitionAnimationId({ state }),
  setFormValues: (payload) => setFormValues({ state }, payload),
  setScreenOptionVisibility: (payload) =>
    setScreenOptionVisibility({ state }, payload),
  showBlurOption: () => showBlurOption({ state }),
  showOpacityOption: () => showOpacityOption({ state }),
});

describe("commandLineScreen.handlers", () => {
  it("emits temporary presentation state when opacity and blur change", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    setScreenOptionVisibility(
      { state },
      { opacityEnabled: true, blurEnabled: true, blurExplicit: true },
    );

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
            playback: {
              continuity: "render",
              speed: 1,
            },
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

  it("does not enable hidden options when the form includes their defaults", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    setScreenOptionVisibility(
      { state },
      { opacityEnabled: false, blurEnabled: false, blurExplicit: false },
    );

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
              opacity: 1,
              blur: false,
              blurX: 6,
              blurY: 9,
              blurQuality: 3,
              blurKernelSize: 9,
              blurRepeatEdgePixels: true,
            },
          },
        },
      },
    );

    expect(selectOpacityOptionEnabled({ state })).toBe(false);
    expect(selectBlurOptionEnabled({ state })).toBe(false);
    expect(dispatchEvent.mock.calls[0][0].detail.presentationState).toEqual({
      screen: {
        animations: {
          resourceId: "screen-crossfade",
          playback: { continuity: "render", speed: 1 },
        },
      },
    });
  });

  it("adds screen options from the Options section menu", async () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const showDropdownMenu = vi
      .fn()
      .mockResolvedValueOnce({ item: { key: "opacity" } })
      .mockResolvedValueOnce({ item: { key: "blur" } });
    const deps = {
      appService: { showDropdownMenu },
      dispatchEvent,
      i18n: EN_I18N,
      render,
      store: createStoreApi(state),
    };
    const payload = {
      _event: {
        detail: {
          sectionId: "options",
          actionId: "add",
          position: { x: 120, y: 240 },
        },
      },
    };

    await handleOptionsSectionAction(deps, payload);

    expect(showDropdownMenu).toHaveBeenNthCalledWith(1, {
      items: [
        { type: "item", label: "Opacity", key: "opacity" },
        { type: "item", label: "Blur", key: "blur" },
      ],
      x: 120,
      y: 240,
      place: "be",
    });
    expect(selectOpacityOptionEnabled({ state })).toBe(true);
    expect(dispatchEvent.mock.calls[0][0].detail.presentationState).toEqual({
      screen: { opacity: 1 },
    });

    await handleOptionsSectionAction(deps, payload);

    expect(showDropdownMenu).toHaveBeenNthCalledWith(2, {
      items: [{ type: "item", label: "Blur", key: "blur" }],
      x: 120,
      y: 240,
      place: "be",
    });
    expect(selectBlurOptionEnabled({ state })).toBe(true);
    expect(dispatchEvent.mock.calls[1][0].detail.presentationState).toEqual({
      screen: {
        opacity: 1,
        blur: {
          x: 6,
          y: 9,
          quality: 3,
          kernelSize: 9,
          repeatEdgePixels: true,
        },
      },
    });
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("removes opacity and blur from their option section actions", async () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    showOpacityOption({ state });
    showBlurOption({ state });
    const deps = {
      dispatchEvent,
      render,
      store: createStoreApi(state),
    };

    await handleOptionsSectionAction(deps, {
      _event: { detail: { sectionId: "opacity", actionId: "remove" } },
    });
    await handleOptionsSectionAction(deps, {
      _event: { detail: { sectionId: "blur", actionId: "remove" } },
    });

    expect(selectOpacityOptionEnabled({ state })).toBe(false);
    expect(selectBlurOptionEnabled({ state })).toBe(false);
    expect(dispatchEvent.mock.calls[0][0].detail.presentationState).toEqual({
      screen: {
        blur: {
          x: 6,
          y: 9,
          quality: 3,
          kernelSize: 9,
          repeatEdgePixels: true,
        },
      },
    });
    expect(dispatchEvent.mock.calls[1][0].detail.presentationState).toEqual({
      screen: { blur: null },
    });
    expect(render).toHaveBeenCalledTimes(2);
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
          playback: {
            continuity: "render",
            speed: 1,
          },
        },
      },
    });
  });

  it("submits screen opacity and blur without requiring an animation", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();
    setScreenOptionVisibility(
      { state },
      { opacityEnabled: true, blurEnabled: true, blurExplicit: true },
    );

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
    setScreenOptionVisibility(
      { state },
      { opacityEnabled: false, blurEnabled: false, blurExplicit: true },
    );

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
          playback: {
            continuity: "render",
            speed: 1,
          },
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
