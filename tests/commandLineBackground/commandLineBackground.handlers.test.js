import { describe, expect, it, vi } from "vitest";
import {
  handleBeforeMount,
  handleFormInputChange,
  handleSubmitClick,
} from "../../src/components/commandLineBackground/commandLineBackground.handlers.js";
import {
  createInitialState,
  selectBackgroundLoop,
  selectPendingResourceId,
  selectSelectedAnimation,
  selectSelectedAnimationPlaybackContinuity,
  selectSelectedAnimationMode,
  selectSelectedResource,
  selectSelectedTransform,
  selectTab,
  setBackgroundLoop,
  setRepositoryState,
  setSearchQuery,
  setSelectedAnimation,
  setSelectedAnimationPlaybackContinuity,
  setSelectedAnimationMode,
  setSelectedResource,
  setSelectedTransform,
  setTab,
} from "../../src/components/commandLineBackground/commandLineBackground.store.js";

const createEmptyCollection = () => ({
  items: {},
  tree: [],
});

const createStoreApi = (state) => ({
  selectBackgroundLoop: () => selectBackgroundLoop({ state }),
  selectPendingResourceId: () => selectPendingResourceId({ state }),
  selectSelectedAnimation: () => selectSelectedAnimation({ state }),
  selectSelectedAnimationPlaybackContinuity: () =>
    selectSelectedAnimationPlaybackContinuity({ state }),
  selectSelectedAnimationMode: () => selectSelectedAnimationMode({ state }),
  selectSelectedResource: () => selectSelectedResource({ state }),
  selectSelectedTransform: () => selectSelectedTransform({ state }),
  selectTab: () => selectTab({ state }),
  setBackgroundLoop: (payload) => setBackgroundLoop({ state }, payload),
  setPendingResourceId: ({ resourceId }) => {
    state.pendingResourceId = resourceId;
  },
  setSearchQuery: (payload) => setSearchQuery({ state }, payload),
  setSelectedAnimation: (payload) => setSelectedAnimation({ state }, payload),
  setSelectedAnimationPlaybackContinuity: (payload) =>
    setSelectedAnimationPlaybackContinuity({ state }, payload),
  setSelectedAnimationMode: (payload) =>
    setSelectedAnimationMode({ state }, payload),
  setSelectedResource: (payload) => setSelectedResource({ state }, payload),
  setSelectedTransform: (payload) => setSelectedTransform({ state }, payload),
  setTab: (payload) => setTab({ state }, payload),
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
      layouts: createEmptyCollection(),
      videos: createEmptyCollection(),
      animations: createEmptyCollection(),
      transforms: {
        items: {
          "bg-center": {
            id: "bg-center",
            type: "transform",
            name: "Center",
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
    expect(selectSelectedAnimation({ state })).toBe("bg-fade");
    expect(selectSelectedAnimationPlaybackContinuity({ state })).toBe("render");
    expect(selectBackgroundLoop({ state })).toBe(true);
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
});
