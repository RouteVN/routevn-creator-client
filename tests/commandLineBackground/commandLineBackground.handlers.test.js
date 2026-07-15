import { describe, expect, it, vi } from "vitest";
import {
  handleCancelCustomTransformEditor,
  handleBeforeMount,
  handleButtonSelectClick,
  handleCustomTransformButtonClick,
  handleCustomTransformDoneButtonClick,
  handleGetBackgroundTransformPreviewCanvasRoot,
  handleFormInputChange,
  handleResourceItemClick,
  handleSpritesheetSelected,
  handleSubmitClick,
} from "../../src/components/commandLineBackground/commandLineBackground.handlers.js";
import {
  createInitialState,
  selectBackgroundLoop,
  selectCustomTransform,
  selectCustomTransformEnabled,
  selectCustomTransformEditorOpen,
  selectMode,
  selectPendingResourceId,
  selectPendingSpritesheetAnimationName,
  selectSelectedAnimation,
  selectSelectedAnimationPlaybackContinuity,
  selectSelectedAnimationMode,
  selectSelectedBlur,
  selectSelectedBlurActionValue,
  selectSelectedColor,
  selectSelectedOpacity,
  selectSelectedResource,
  selectSelectedTransform,
  selectSelectedTransformResource,
  selectTab,
  selectTempSelectedResource,
  closeCustomTransformEditor,
  openCustomTransformEditor,
  setBackgroundLoop,
  setCustomTransform,
  setCustomTransformEnabled,
  setMode,
  setPendingResourceId,
  setRepositoryState,
  setSearchQuery,
  setSelectedAnimation,
  setSelectedAnimationPlaybackContinuity,
  setSelectedAnimationMode,
  setSelectedBlur,
  setSelectedBlurEnabled,
  setSelectedBlurField,
  setSelectedColor,
  setSelectedOpacity,
  setSelectedResource,
  setSelectedTransform,
  setTab,
  setTempSelectedResource,
  setUiConfig,
} from "../../src/components/commandLineBackground/commandLineBackground.store.js";

const createEmptyCollection = () => ({
  items: {},
  tree: [],
});

const createStoreApi = (state) => ({
  selectBackgroundLoop: () => selectBackgroundLoop({ state }),
  selectCustomTransform: () => selectCustomTransform({ state }),
  selectCustomTransformEnabled: () => selectCustomTransformEnabled({ state }),
  selectCustomTransformEditorOpen: () =>
    selectCustomTransformEditorOpen({ state }),
  selectMode: () => selectMode({ state }),
  selectPendingResourceId: () => selectPendingResourceId({ state }),
  selectPendingSpritesheetAnimationName: () =>
    selectPendingSpritesheetAnimationName({ state }),
  selectSelectedAnimation: () => selectSelectedAnimation({ state }),
  selectSelectedAnimationPlaybackContinuity: () =>
    selectSelectedAnimationPlaybackContinuity({ state }),
  selectSelectedAnimationMode: () => selectSelectedAnimationMode({ state }),
  selectSelectedBlur: () => selectSelectedBlur({ state }),
  selectSelectedBlurActionValue: () => selectSelectedBlurActionValue({ state }),
  selectSelectedColor: () => selectSelectedColor({ state }),
  selectSelectedOpacity: () => selectSelectedOpacity({ state }),
  selectSelectedResource: () => selectSelectedResource({ state }),
  selectSelectedTransform: () => selectSelectedTransform({ state }),
  selectSelectedTransformResource: () =>
    selectSelectedTransformResource({ state }),
  selectTab: () => selectTab({ state }),
  selectTempSelectedResource: () => selectTempSelectedResource({ state }),
  closeCustomTransformEditor: (payload) =>
    closeCustomTransformEditor({ state }, payload),
  openCustomTransformEditor: (payload) =>
    openCustomTransformEditor({ state }, payload),
  setBackgroundLoop: (payload) => setBackgroundLoop({ state }, payload),
  setCustomTransform: (payload) => setCustomTransform({ state }, payload),
  setCustomTransformEnabled: (payload) =>
    setCustomTransformEnabled({ state }, payload),
  setMode: (payload) => setMode({ state }, payload),
  setPendingResourceId: (payload) => setPendingResourceId({ state }, payload),
  setSearchQuery: (payload) => setSearchQuery({ state }, payload),
  setSelectedAnimation: (payload) => setSelectedAnimation({ state }, payload),
  setSelectedAnimationPlaybackContinuity: (payload) =>
    setSelectedAnimationPlaybackContinuity({ state }, payload),
  setSelectedAnimationMode: (payload) =>
    setSelectedAnimationMode({ state }, payload),
  setSelectedBlur: (payload) => setSelectedBlur({ state }, payload),
  setSelectedBlurEnabled: (payload) =>
    setSelectedBlurEnabled({ state }, payload),
  setSelectedBlurField: (payload) => setSelectedBlurField({ state }, payload),
  setSelectedColor: (payload) => setSelectedColor({ state }, payload),
  setSelectedOpacity: (payload) => setSelectedOpacity({ state }, payload),
  setSelectedResource: (payload) => setSelectedResource({ state }, payload),
  setSelectedTransform: (payload) => setSelectedTransform({ state }, payload),
  setTab: (payload) => setTab({ state }, payload),
  setTempSelectedResource: (payload) =>
    setTempSelectedResource({ state }, payload),
  setUiConfig: (payload) => setUiConfig({ state }, payload),
});

const setRepositoryCollections = (state) => {
  setRepositoryState(
    { state },
    {
      images: {
        items: {
          "bg-school": {
            id: "bg-school",
            type: "image",
            name: "School",
            fileId: "file-school",
          },
        },
        tree: [{ id: "bg-school" }],
      },
      spritesheets: {
        items: {
          "bg-spritesheet": {
            id: "bg-spritesheet",
            type: "spritesheet",
            name: "Forest",
            fileId: "file-forest-spritesheet",
            jsonData: {
              frames: {
                "wind-0": {
                  frame: { x: 0, y: 0, w: 128, h: 72 },
                },
              },
            },
            animations: {
              wind: {
                frames: ["wind-0"],
                fps: 10,
              },
            },
          },
        },
        tree: [{ id: "bg-spritesheet" }],
      },
      layouts: createEmptyCollection(),
      videos: createEmptyCollection(),
      animations: {
        items: {
          "bg-fade": {
            id: "bg-fade",
            type: "animation",
            name: "Fade",
            animation: {
              type: "transition",
            },
          },
        },
        tree: [{ id: "bg-fade" }],
      },
      transforms: {
        items: {
          "bg-center": {
            id: "bg-center",
            type: "transform",
            name: "Center",
            x: 100,
            y: 120,
            anchorX: 0.5,
            anchorY: 0.5,
            scaleX: 1.2,
            scaleY: 1.1,
            rotation: 8,
          },
        },
        tree: [{ id: "bg-center" }],
      },
    },
  );
};

describe("commandLineBackground.handlers", () => {
  it("hydrates existing transform state before mount", () => {
    const state = createInitialState();

    handleBeforeMount({
      store: createStoreApi(state),
      props: {
        background: {
          resourceId: "bg-school",
          transformId: "bg-center",
          opacity: 0.5,
          blur: {
            x: 6,
            y: 9,
            quality: 3,
            kernelSize: 9,
            repeatEdgePixels: true,
          },
          animations: {
            resourceId: "bg-fade",
            playback: {
              continuity: "render",
            },
          },
          loop: true,
        },
      },
    });

    expect(selectPendingResourceId({ state })).toBe("bg-school");
    expect(selectSelectedTransform({ state })).toBe("bg-center");
    expect(selectSelectedOpacity({ state })).toBe(0.5);
    expect(selectSelectedBlur({ state })).toEqual({
      x: 6,
      y: 9,
      quality: 3,
      kernelSize: 9,
      repeatEdgePixels: true,
    });
    expect(selectSelectedAnimation({ state })).toBe("bg-fade");
    expect(selectSelectedAnimationPlaybackContinuity({ state })).toBe("render");
    expect(selectBackgroundLoop({ state })).toBe(true);
  });

  it("hydrates an existing spritesheet animation before repository setup", () => {
    const state = createInitialState();

    handleBeforeMount({
      store: createStoreApi(state),
      props: {
        background: {
          resourceId: "bg-spritesheet",
          animationName: "wind",
        },
      },
    });

    expect(selectPendingResourceId({ state })).toBe("bg-spritesheet");
    expect(selectPendingSpritesheetAnimationName({ state })).toBe("wind");
  });

  it("hydrates existing inline custom transform state before mount", () => {
    const state = createInitialState();

    handleBeforeMount({
      store: createStoreApi(state),
      props: {
        background: {
          resourceId: "bg-school",
          x: 100,
          y: 120,
          anchorX: 0,
          anchorY: 1,
          scaleX: 1.2,
          scaleY: 0.8,
          rotation: -8,
          originX: 64,
          originY: 128,
        },
      },
    });

    expect(selectPendingResourceId({ state })).toBe("bg-school");
    expect(selectCustomTransformEnabled({ state })).toBe(true);
    expect(selectSelectedTransform({ state })).toBeUndefined();
    expect(selectCustomTransform({ state })).toEqual({
      x: 100,
      y: 120,
      anchorX: 0,
      anchorY: 1,
      scaleX: 1.2,
      scaleY: 0.8,
      rotation: -8,
      originX: 64,
      originY: 128,
    });
  });

  it("clears stale custom transform mode when hydrating a predefined transform", () => {
    const state = createInitialState();

    setCustomTransformEnabled(
      { state },
      {
        enabled: true,
      },
    );
    setCustomTransform(
      { state },
      {
        transform: {
          x: 1400,
          y: 800,
        },
      },
    );

    handleBeforeMount({
      store: createStoreApi(state),
      props: {
        background: {
          resourceId: "bg-school",
          transformId: "bg-center",
          x: 1400,
          y: 800,
          anchorX: 0.5,
          anchorY: 0.5,
          scaleX: 1.2,
          scaleY: 1.2,
          rotation: 0,
          originX: 960,
          originY: 540,
        },
      },
    });

    expect(selectCustomTransformEnabled({ state })).toBe(false);
    expect(selectCustomTransform({ state })).toBeUndefined();
    expect(selectSelectedTransform({ state })).toBe("bg-center");
  });

  it("submits transformId when selected and omits it when cleared", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();

    setRepositoryCollections(state);
    setSelectedResource(
      { state },
      {
        resourceId: "bg-school",
        resourceType: "image",
      },
    );

    handleFormInputChange(
      {
        store: createStoreApi(state),
        render,
      },
      {
        _event: {
          detail: {
            name: "transformId",
            value: "bg-center",
          },
        },
      },
    );

    handleSubmitClick(
      {
        dispatchEvent,
        store: createStoreApi(state),
      },
      {},
    );

    expect(selectSelectedTransform({ state })).toBe("bg-center");
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      background: {
        resourceId: "bg-school",
        transformId: "bg-center",
      },
    });

    dispatchEvent.mockClear();

    handleFormInputChange(
      {
        store: createStoreApi(state),
        render,
      },
      {
        _event: {
          detail: {
            name: "transformId",
            value: undefined,
          },
        },
      },
    );

    handleSubmitClick(
      {
        dispatchEvent,
        store: createStoreApi(state),
      },
      {},
    );

    expect(selectSelectedTransform({ state })).toBeUndefined();
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      background: {
        resourceId: "bg-school",
      },
    });
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("submits inline transform fields when custom transform is enabled", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();

    setRepositoryCollections(state);
    setSelectedResource(
      { state },
      {
        resourceId: "bg-school",
        resourceType: "image",
      },
    );
    setSelectedTransform(
      { state },
      {
        transformId: "bg-center",
      },
    );
    setCustomTransformEnabled(
      { state },
      {
        enabled: true,
      },
    );
    setCustomTransform(
      { state },
      {
        transform: {
          x: 100,
          y: 120,
          anchorX: 0,
          anchorY: 1,
          scaleX: 1.2,
          scaleY: 1.2,
          rotation: -8,
          originX: 64,
          originY: 128,
        },
      },
    );

    handleSubmitClick(
      {
        dispatchEvent,
        store: createStoreApi(state),
      },
      {},
    );

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      background: {
        resourceId: "bg-school",
        x: 100,
        y: 120,
        anchorX: 0,
        anchorY: 1,
        scaleX: 1.2,
        scaleY: 1.2,
        rotation: -8,
        originX: 64,
        originY: 128,
      },
    });
  });

  it("copies the selected transform into custom transform when enabled", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();

    setRepositoryCollections(state);
    setSelectedResource(
      { state },
      {
        resourceId: "bg-school",
        resourceType: "image",
      },
    );
    setSelectedTransform(
      { state },
      {
        transformId: "bg-center",
      },
    );

    handleFormInputChange(
      {
        store: createStoreApi(state),
        render,
        dispatchEvent,
      },
      {
        _event: {
          detail: {
            name: "customTransform",
            value: true,
          },
        },
      },
    );

    expect(selectCustomTransformEnabled({ state })).toBe(true);
    expect(selectCustomTransform({ state })).toEqual({
      x: 100,
      y: 120,
      anchorX: 0.5,
      anchorY: 0.5,
      scaleX: 1.2,
      scaleY: 1.1,
      rotation: 8,
      originX: 0,
      originY: 0,
    });
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      presentationState: {
        background: {
          resourceId: "bg-school",
          x: 100,
          y: 120,
          anchorX: 0.5,
          anchorY: 0.5,
          scaleX: 1.2,
          scaleY: 1.1,
          rotation: 8,
          originX: 0,
          originY: 0,
        },
      },
    });
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("emits temporary presentation state when background form fields change", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();

    setRepositoryCollections(state);
    setSelectedResource(
      { state },
      {
        resourceId: "bg-school",
        resourceType: "image",
      },
    );

    handleFormInputChange(
      {
        store: createStoreApi(state),
        render,
        dispatchEvent,
      },
      {
        _event: {
          detail: {
            name: "transformId",
            value: "bg-center",
          },
        },
      },
    );

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].type).toBe(
      "temporary-presentation-state-change",
    );
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      presentationState: {
        background: {
          resourceId: "bg-school",
          transformId: "bg-center",
        },
      },
    });
  });

  it("submits opacity when selected and omits it when cleared", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();

    setRepositoryCollections(state);
    setSelectedResource(
      { state },
      {
        resourceId: "bg-school",
        resourceType: "image",
      },
    );

    handleFormInputChange(
      {
        store: createStoreApi(state),
        render,
        dispatchEvent,
      },
      {
        _event: {
          detail: {
            name: "opacity",
            value: "0.5",
          },
        },
      },
    );

    handleSubmitClick(
      {
        dispatchEvent,
        store: createStoreApi(state),
      },
      {},
    );

    expect(selectSelectedOpacity({ state })).toBe(0.5);
    expect(dispatchEvent).toHaveBeenCalledTimes(2);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      presentationState: {
        background: {
          resourceId: "bg-school",
          opacity: 0.5,
        },
      },
    });
    expect(dispatchEvent.mock.calls[1][0].detail).toEqual({
      background: {
        resourceId: "bg-school",
        opacity: 0.5,
      },
    });

    dispatchEvent.mockClear();

    handleFormInputChange(
      {
        store: createStoreApi(state),
        render,
        dispatchEvent,
      },
      {
        _event: {
          detail: {
            name: "opacity",
            value: "",
          },
        },
      },
    );

    handleSubmitClick(
      {
        dispatchEvent,
        store: createStoreApi(state),
      },
      {},
    );

    expect(selectSelectedOpacity({ state })).toBeUndefined();
    expect(dispatchEvent).toHaveBeenCalledTimes(2);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      presentationState: {
        background: {
          resourceId: "bg-school",
        },
      },
    });
    expect(dispatchEvent.mock.calls[1][0].detail).toEqual({
      background: {
        resourceId: "bg-school",
      },
    });
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("submits blur when enabled and clears it when disabled", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();

    setRepositoryCollections(state);
    setSelectedResource(
      { state },
      {
        resourceId: "bg-school",
        resourceType: "image",
      },
    );

    handleFormInputChange(
      {
        store: createStoreApi(state),
        render,
        dispatchEvent,
      },
      {
        _event: {
          detail: {
            name: "blur",
            value: true,
          },
        },
      },
    );

    handleFormInputChange(
      {
        store: createStoreApi(state),
        render,
        dispatchEvent,
      },
      {
        _event: {
          detail: {
            name: "blurX",
            value: "8",
          },
        },
      },
    );

    handleFormInputChange(
      {
        store: createStoreApi(state),
        render,
        dispatchEvent,
      },
      {
        _event: {
          detail: {
            name: "blurRepeatEdgePixels",
            value: false,
          },
        },
      },
    );

    handleSubmitClick(
      {
        dispatchEvent,
        store: createStoreApi(state),
      },
      {},
    );

    expect(selectSelectedBlur({ state })).toEqual({
      x: 8,
      y: 9,
      quality: 3,
      kernelSize: 9,
      repeatEdgePixels: false,
    });
    expect(dispatchEvent).toHaveBeenCalledTimes(4);
    expect(dispatchEvent.mock.calls[3][0].detail).toEqual({
      background: {
        resourceId: "bg-school",
        blur: {
          x: 8,
          y: 9,
          quality: 3,
          kernelSize: 9,
          repeatEdgePixels: false,
        },
      },
    });

    dispatchEvent.mockClear();

    handleFormInputChange(
      {
        store: createStoreApi(state),
        render,
        dispatchEvent,
      },
      {
        _event: {
          detail: {
            name: "blur",
            value: false,
          },
        },
      },
    );

    handleSubmitClick(
      {
        dispatchEvent,
        store: createStoreApi(state),
      },
      {},
    );

    expect(selectSelectedBlur({ state })).toBeUndefined();
    expect(dispatchEvent).toHaveBeenCalledTimes(2);
    expect(dispatchEvent.mock.calls[1][0].detail).toEqual({
      background: {
        resourceId: "bg-school",
        blur: null,
      },
    });
    expect(render).toHaveBeenCalledTimes(4);
  });

  it("selects animation from the single animation field", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();

    setRepositoryCollections(state);
    setSelectedResource(
      { state },
      {
        resourceId: "bg-school",
        resourceType: "image",
      },
    );

    handleFormInputChange(
      {
        store: createStoreApi(state),
        render,
        dispatchEvent,
      },
      {
        _event: {
          detail: {
            name: "animationId",
            value: "bg-fade",
          },
        },
      },
    );

    handleSubmitClick(
      {
        dispatchEvent,
        store: createStoreApi(state),
      },
      {},
    );

    expect(selectSelectedAnimation({ state })).toBe("bg-fade");
    expect(selectSelectedAnimationMode({ state })).toBe("transition");
    expect(dispatchEvent).toHaveBeenCalledTimes(2);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      presentationState: {
        background: {
          resourceId: "bg-school",
          animations: {
            resourceId: "bg-fade",
            playback: {
              continuity: "render",
            },
          },
        },
      },
    });
    expect(dispatchEvent.mock.calls[1][0].detail).toEqual({
      background: {
        resourceId: "bg-school",
        animations: {
          resourceId: "bg-fade",
          playback: {
            continuity: "render",
          },
        },
      },
    });
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("clears animation from the clearable animation field", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();

    setRepositoryCollections(state);
    setSelectedResource(
      { state },
      {
        resourceId: "bg-school",
        resourceType: "image",
      },
    );
    setSelectedAnimation(
      { state },
      {
        animationId: "bg-fade",
      },
    );

    handleFormInputChange(
      {
        store: createStoreApi(state),
        render,
        dispatchEvent,
      },
      {
        _event: {
          detail: {
            name: "animationId",
            value: undefined,
          },
        },
      },
    );

    handleSubmitClick(
      {
        dispatchEvent,
        store: createStoreApi(state),
      },
      {},
    );

    expect(selectSelectedAnimation({ state })).toBeUndefined();
    expect(selectSelectedAnimationMode({ state })).toBe("none");
    expect(dispatchEvent).toHaveBeenCalledTimes(2);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      presentationState: {
        background: {
          resourceId: "bg-school",
        },
      },
    });
    expect(dispatchEvent.mock.calls[1][0].detail).toEqual({
      background: {
        resourceId: "bg-school",
      },
    });
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("emits temporary presentation state from gallery resource selection", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();

    setRepositoryCollections(state);
    setMode({ state }, { mode: "gallery" });

    handleResourceItemClick(
      {
        store: createStoreApi(state),
        render,
        dispatchEvent,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              resourceId: "bg-school",
            },
          },
        },
      },
    );

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      presentationState: {
        background: {
          resourceId: "bg-school",
        },
      },
    });
  });

  it("includes spritesheet animation names in preview and submitted backgrounds", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const store = createStoreApi(state);

    setRepositoryCollections(state);
    setMode({ state }, { mode: "gallery" });

    handleSpritesheetSelected(
      {
        store,
        render,
        dispatchEvent,
      },
      {
        _event: {
          detail: {
            resourceId: "bg-spritesheet",
            animationName: "wind",
          },
        },
      },
    );

    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      presentationState: {
        background: {
          resourceId: "bg-spritesheet",
          animationName: "wind",
        },
      },
    });

    handleButtonSelectClick({ store, render, dispatchEvent });
    handleSubmitClick({ store, dispatchEvent }, {});

    expect(selectSelectedResource({ state })).toMatchObject({
      resourceId: "bg-spritesheet",
      resourceType: "spritesheet",
      animationName: "wind",
    });
    expect(dispatchEvent.mock.calls[2][0].detail).toEqual({
      background: {
        resourceId: "bg-spritesheet",
        animationName: "wind",
      },
    });
  });

  it("submits playback continuity inside background animations", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();

    setRepositoryCollections(state);
    setSelectedResource(
      { state },
      {
        resourceId: "bg-school",
        resourceType: "image",
      },
    );
    setSelectedAnimationMode(
      { state },
      {
        mode: "update",
      },
    );
    setSelectedAnimation(
      { state },
      {
        animationId: "bg-fade",
      },
    );

    handleFormInputChange(
      {
        store: createStoreApi(state),
        render,
      },
      {
        _event: {
          detail: {
            name: "playbackContinuity",
            value: "render",
          },
        },
      },
    );

    handleSubmitClick(
      {
        dispatchEvent,
        store: createStoreApi(state),
      },
      {},
    );

    expect(selectSelectedAnimationPlaybackContinuity({ state })).toBe("render");
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      background: {
        resourceId: "bg-school",
        animations: {
          resourceId: "bg-fade",
          playback: {
            continuity: "render",
          },
        },
      },
    });
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("opens the local transform editor and emits customize from inside the background command line", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    };

    setRepositoryCollections(state);
    setSelectedResource(
      { state },
      {
        resourceId: "bg-school",
        resourceType: "image",
      },
    );
    setSelectedTransform(
      { state },
      {
        transformId: "bg-center",
      },
    );

    handleCustomTransformButtonClick(
      {
        store: createStoreApi(state),
        render,
        dispatchEvent,
      },
      {
        _event: event,
      },
    );

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(selectCustomTransformEditorOpen({ state })).toBe(true);
    expect(render).toHaveBeenCalledTimes(1);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].type).toBe(
      "background-transform-customize",
    );
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      background: {
        resourceId: "bg-school",
        transformId: "bg-center",
      },
    });
  });

  it("closes the local transform editor and emits done without submitting the command line", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    };

    openCustomTransformEditor({ state });

    handleCustomTransformDoneButtonClick(
      {
        store: createStoreApi(state),
        render,
        dispatchEvent,
      },
      {
        _event: event,
      },
    );

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(selectCustomTransformEditorOpen({ state })).toBe(false);
    expect(render).toHaveBeenCalledTimes(1);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].type).toBe(
      "background-transform-editor-done",
    );
    expect(dispatchEvent.mock.calls[0][0].bubbles).toBe(true);
    expect(dispatchEvent.mock.calls[0][0].composed).toBe(true);
  });

  it("cancels the local transform editor without saving", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    };

    openCustomTransformEditor({ state });

    handleCancelCustomTransformEditor(
      {
        store: createStoreApi(state),
        render,
        dispatchEvent,
      },
      {
        _event: event,
      },
    );

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(selectCustomTransformEditorOpen({ state })).toBe(false);
    expect(render).toHaveBeenCalledTimes(1);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it("exposes the nested background transform preview canvas root", () => {
    const canvasRoot = {};
    const getCanvasRoot = vi.fn(() => canvasRoot);

    expect(
      handleGetBackgroundTransformPreviewCanvasRoot({
        refs: {
          backgroundTransformPreviewCanvasHost: {
            getCanvasRoot,
          },
        },
      }),
    ).toBe(canvasRoot);
    expect(getCanvasRoot).toHaveBeenCalledTimes(1);
  });
});
