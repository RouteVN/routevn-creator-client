import { describe, expect, it, vi } from "vitest";
import {
  handleDurationResizeEnd,
  handleDurationResizeMove,
  handleDurationResizeStart,
  handleKeyframeClick,
  handleKeyframeMove,
  handleKeyframeMoveEnd,
  handleKeyframeMoveStart,
  handlePropertyNameClick,
  handlePropertyNameKeyDown,
  handleRulerScrubEnd,
  handleRulerScrubMove,
  handleRulerScrubStart,
  handleTrackClick,
  handleTrackMouseMove,
} from "../../src/components/keyframeTimeline/keyframeTimeline.handlers.js";

describe("keyframeTimeline.handlers", () => {
  it("shows the add target on empty tracks and delay gaps between keyframes", () => {
    let hoverTarget;
    const store = {
      selectHoverTarget: vi.fn(() => hoverTarget),
      setHoverTarget: vi.fn(({ hoverTarget: nextHoverTarget }) => {
        hoverTarget = nextHoverTarget;
      }),
    };
    const dispatchEvent = vi.fn();
    const render = vi.fn();
    const createTrack = (keyframes) => ({
      dataset: {
        property: "x",
        trackMode: "keyframes",
      },
      getBoundingClientRect: () => ({ left: 0, width: 240 }),
      querySelectorAll: () => keyframes,
    });
    const props = {
      editable: true,
      side: "update",
      properties: {
        x: {
          keyframes: [{ duration: 1000 }, { delay: 1500, duration: 1000 }],
        },
      },
    };

    handleTrackMouseMove(
      { props, render, store },
      { _event: { clientX: 120, currentTarget: createTrack([]) } },
    );

    expect(store.setHoverTarget).toHaveBeenLastCalledWith({
      hoverTarget: {
        property: "x",
        mode: "empty",
        index: 0,
        chipLeft: 120,
        zoneLeft: 0,
        zoneWidth: 240,
      },
    });

    const track = createTrack([
      {
        dataset: { index: "0" },
        getBoundingClientRect: () => ({ left: 0, right: 60 }),
      },
      {
        dataset: { index: "1" },
        getBoundingClientRect: () => ({ left: 180, right: 240 }),
      },
    ]);
    handleTrackMouseMove(
      { props, render, store },
      { _event: { clientX: 120, currentTarget: track } },
    );

    expect(store.setHoverTarget).toHaveBeenLastCalledWith({
      hoverTarget: {
        property: "x",
        mode: "gap",
        index: 1,
        chipLeft: 120,
        zoneLeft: 60,
        zoneWidth: 120,
        delay: 250,
        duration: 1000,
        followingDelay: 250,
      },
    });

    handleTrackClick(
      { dispatchEvent, props, store },
      {
        _event: {
          clientX: 120,
          clientY: 40,
          currentTarget: track,
          stopPropagation: vi.fn(),
          target: { closest: vi.fn(() => undefined) },
        },
      },
    );

    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({
      type: "add-keyframe",
      detail: {
        property: "x",
        side: "update",
        index: 1,
        delay: 250,
        duration: 1000,
        followingDelay: 250,
      },
    });

    handleTrackMouseMove(
      { props, render, store },
      { _event: { clientX: 30, currentTarget: track } },
    );
    expect(store.setHoverTarget).toHaveBeenLastCalledWith({
      hoverTarget: undefined,
    });
  });

  it("shows add targets before and after a single keyframe", () => {
    const setHoverTarget = vi.fn();
    const render = vi.fn();
    const keyframe = {
      dataset: { index: "0" },
      getBoundingClientRect: () => ({ left: 40, right: 120 }),
    };
    const track = {
      dataset: {
        property: "x",
        trackMode: "keyframes",
      },
      getBoundingClientRect: () => ({ left: 0, width: 240 }),
      querySelectorAll: () => [keyframe],
    };
    const deps = {
      props: {
        editable: true,
        timelineDuration: 3000,
        properties: {
          x: {
            keyframes: [{ delay: 500, duration: 1000 }],
          },
        },
      },
      render,
      store: { setHoverTarget },
    };

    handleTrackMouseMove(deps, {
      _event: { clientX: 20, currentTarget: track },
    });
    expect(setHoverTarget).toHaveBeenLastCalledWith({
      hoverTarget: {
        property: "x",
        mode: "gap",
        index: 0,
        chipLeft: 20,
        zoneLeft: 0,
        zoneWidth: 40,
        delay: 0,
        duration: 500,
        followingDelay: 0,
      },
    });

    handleTrackMouseMove(deps, {
      _event: { clientX: 180, currentTarget: track },
    });
    expect(setHoverTarget).toHaveBeenLastCalledWith({
      hoverTarget: {
        property: "x",
        mode: "gap",
        index: 1,
        chipLeft: 180,
        zoneLeft: 120,
        zoneWidth: 120,
        delay: 250,
        duration: 1000,
      },
    });
  });

  it("selects a property on click", () => {
    const dispatchEvent = vi.fn();
    const stopPropagation = vi.fn();
    const currentTarget = { dataset: { property: "alpha" } };
    const deps = { dispatchEvent, props: { editable: true, side: "next" } };

    handlePropertyNameClick(deps, {
      _event: {
        clientX: 20,
        clientY: 60,
        currentTarget,
        stopPropagation,
      },
    });
    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({
      type: "property-name-click",
      detail: {
        property: "alpha",
        side: "next",
        x: 20,
        y: 60,
      },
    });
  });

  it("positions keyboard property activation at the focused row", () => {
    const dispatchEvent = vi.fn();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const currentTarget = {
      dataset: { property: "alpha" },
      getBoundingClientRect: () => ({
        height: 32,
        left: 100,
        top: 20,
        width: 80,
      }),
    };
    const deps = {
      dispatchEvent,
      props: { editable: true, side: "next" },
    };

    handlePropertyNameKeyDown(deps, {
      _event: {
        key: "Enter",
        currentTarget,
        preventDefault,
        stopPropagation,
      },
    });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({
      type: "property-name-click",
      detail: {
        property: "alpha",
        side: "next",
        x: 140,
        y: 36,
      },
    });
  });

  it("does not expose property selection behavior in read-only timelines", () => {
    const dispatchEvent = vi.fn();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const currentTarget = { dataset: { property: "alpha" } };
    const deps = {
      dispatchEvent,
      props: { editable: false, side: "update" },
    };

    handlePropertyNameClick(deps, {
      _event: { currentTarget, preventDefault, stopPropagation },
    });
    handlePropertyNameKeyDown(deps, {
      _event: {
        key: "Enter",
        currentTarget,
        preventDefault,
        stopPropagation,
      },
    });

    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
  });

  it("changes preview time only while the numbered ruler is being scrubbed", () => {
    let rulerScrub;
    const store = {
      clearRulerScrub: vi.fn(() => {
        rulerScrub = undefined;
      }),
      selectRulerScrub: vi.fn(() => rulerScrub),
      startRulerScrub: vi.fn(({ leftPercent, pointerId }) => {
        rulerScrub = { leftPercent, pointerId };
      }),
      updateRulerScrub: vi.fn(({ leftPercent }) => {
        rulerScrub.leftPercent = leftPercent;
      }),
    };
    const dispatchEvent = vi.fn();
    const render = vi.fn();
    const preventDefault = vi.fn();
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    const rulerElement = {
      getBoundingClientRect: () => ({ left: 100, width: 400 }),
      releasePointerCapture,
      setPointerCapture,
    };
    const deps = {
      dispatchEvent,
      props: {
        interactiveRuler: true,
        side: "update",
        timelineDuration: 1000,
      },
      render,
      store,
    };

    handleRulerScrubStart(deps, {
      _event: {
        button: 0,
        clientX: 200,
        currentTarget: rulerElement,
        pointerId: 3,
        preventDefault,
      },
    });
    handleRulerScrubMove(deps, {
      _event: {
        clientX: 300,
        currentTarget: rulerElement,
        pointerId: 3,
        preventDefault,
      },
    });
    handleRulerScrubEnd(deps, {
      _event: {
        clientX: 340,
        currentTarget: rulerElement,
        pointerId: 3,
        preventDefault,
      },
    });

    expect(setPointerCapture).toHaveBeenCalledWith(3);
    expect(releasePointerCapture).toHaveBeenCalledWith(3);
    expect(dispatchEvent.mock.calls.map(([event]) => event.detail)).toEqual([
      {
        committed: false,
        side: "update",
        timeMs: 250,
        leftPercent: 25,
      },
      {
        committed: false,
        side: "update",
        timeMs: 500,
        leftPercent: 50,
      },
      {
        committed: true,
        side: "update",
        timeMs: 600,
        leftPercent: 60,
      },
    ]);
    expect(store.clearRulerScrub).toHaveBeenCalledWith({});
  });

  it("selects an edge keyframe instead of treating it as an add action", () => {
    const dispatchEvent = vi.fn();
    const stopPropagation = vi.fn();

    handleKeyframeClick(
      {
        dispatchEvent,
        props: { editable: true, side: "next" },
        store: {
          clearKeyframeClickSuppression: vi.fn(),
          selectKeyframeClickSuppressed: vi.fn(() => false),
        },
      },
      {
        _event: {
          clientX: 100,
          clientY: 120,
          currentTarget: {
            dataset: {
              property: "x",
              index: "0",
            },
          },
          stopPropagation,
        },
      },
    );

    expect(stopPropagation).toHaveBeenCalled();
    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({
      type: "keyframe-click",
      detail: {
        property: "x",
        index: "0",
        side: "next",
      },
    });
  });

  it("drags a keyframe end handle to change its duration", () => {
    let durationResize;
    const store = {
      clearDurationResize: vi.fn(() => {
        durationResize = undefined;
      }),
      selectDurationResize: vi.fn(() => durationResize),
      setDurationResizeTiming: vi.fn(({ delay, duration }) => {
        durationResize.delay = delay;
        durationResize.duration = duration;
      }),
      startDurationResize: vi.fn((resize) => {
        durationResize = {
          ...resize,
          delay: resize.startDelay,
          duration: resize.startDuration,
        };
      }),
    };
    const dispatchEvent = vi.fn();
    const render = vi.fn();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    const trackElement = {
      getBoundingClientRect: () => ({ width: 400 }),
    };
    const handleElement = {
      dataset: {
        property: "x",
        index: "0",
        resizeEdge: "right",
      },
      closest: vi.fn(() => trackElement),
      releasePointerCapture,
      setPointerCapture,
    };
    const deps = {
      dispatchEvent,
      props: {
        editable: true,
        side: "next",
        properties: {
          x: {
            keyframes: [{ duration: 1000 }],
          },
        },
      },
      render,
      store,
    };

    handleDurationResizeStart(deps, {
      _event: {
        button: 0,
        clientX: 100,
        currentTarget: handleElement,
        pointerId: 7,
        preventDefault,
        stopPropagation,
      },
    });
    handleDurationResizeMove(deps, {
      _event: {
        clientX: 126,
        pointerId: 7,
        preventDefault,
        stopPropagation,
      },
    });
    handleDurationResizeEnd(deps, {
      _event: {
        currentTarget: handleElement,
        pointerId: 7,
        preventDefault,
        stopPropagation,
      },
    });

    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(store.setDurationResizeTiming).toHaveBeenCalledWith({
      delay: 0,
      duration: 1100,
    });
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({
      type: "keyframe-duration-change",
      detail: {
        delay: 0,
        duration: 1100,
        property: "x",
        side: "next",
        index: 0,
      },
    });
    expect(store.clearDurationResize).toHaveBeenCalledWith({});
  });

  it("ignores non-primary pointer resize starts", () => {
    const store = {
      startDurationResize: vi.fn(),
    };
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    handleDurationResizeStart(
      {
        props: { editable: true },
        render: vi.fn(),
        store,
      },
      {
        _event: {
          button: 2,
          preventDefault,
          stopPropagation,
        },
      },
    );

    expect(store.startDurationResize).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
  });

  it("drags a keyframe start handle without moving its end", () => {
    let durationResize;
    const store = {
      clearDurationResize: vi.fn(() => {
        durationResize = undefined;
      }),
      selectDurationResize: vi.fn(() => durationResize),
      setDurationResizeTiming: vi.fn(({ delay, duration }) => {
        durationResize.delay = delay;
        durationResize.duration = duration;
      }),
      startDurationResize: vi.fn((resize) => {
        durationResize = {
          ...resize,
          delay: resize.startDelay,
          duration: resize.startDuration,
        };
      }),
    };
    const dispatchEvent = vi.fn();
    const render = vi.fn();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const releasePointerCapture = vi.fn();
    const trackElement = {
      getBoundingClientRect: () => ({ width: 400 }),
    };
    const handleElement = {
      dataset: {
        property: "x",
        index: "0",
        resizeEdge: "left",
      },
      closest: vi.fn(() => trackElement),
      releasePointerCapture,
      setPointerCapture: vi.fn(),
    };
    const deps = {
      dispatchEvent,
      props: {
        editable: true,
        side: "update",
        properties: {
          x: {
            keyframes: [{ delay: 200, duration: 800 }],
          },
        },
      },
      render,
      store,
    };

    handleDurationResizeStart(deps, {
      _event: {
        button: 0,
        clientX: 100,
        currentTarget: handleElement,
        pointerId: 9,
        preventDefault,
        stopPropagation,
      },
    });
    handleDurationResizeMove(deps, {
      _event: {
        clientX: -100,
        pointerId: 9,
        preventDefault,
        stopPropagation,
      },
    });
    handleDurationResizeMove(deps, {
      _event: {
        clientX: 500,
        pointerId: 9,
        preventDefault,
        stopPropagation,
      },
    });
    handleDurationResizeMove(deps, {
      _event: {
        clientX: 180,
        pointerId: 9,
        preventDefault,
        stopPropagation,
      },
    });
    handleDurationResizeEnd(deps, {
      _event: {
        currentTarget: handleElement,
        pointerId: 9,
        preventDefault,
        stopPropagation,
      },
    });

    expect(store.setDurationResizeTiming.mock.calls).toEqual([
      [{ delay: 0, duration: 1000 }],
      [{ delay: 900, duration: 100 }],
      [{ delay: 400, duration: 600 }],
    ]);
    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({
      type: "keyframe-duration-change",
      detail: {
        delay: 400,
        duration: 600,
        property: "x",
        side: "update",
        index: 0,
      },
    });
  });

  it("drags a keyframe without moving the following keyframe", () => {
    let keyframeMove;
    let keyframeClickSuppressed = false;
    const store = {
      clearKeyframeClickSuppression: vi.fn(() => {
        keyframeClickSuppressed = false;
      }),
      clearKeyframeMove: vi.fn(({ suppressClick = false } = {}) => {
        keyframeMove = undefined;
        keyframeClickSuppressed = suppressClick;
      }),
      markKeyframeMoveDragged: vi.fn(() => {
        keyframeMove.dragged = true;
      }),
      selectKeyframeClickSuppressed: vi.fn(() => keyframeClickSuppressed),
      selectKeyframeMove: vi.fn(() => keyframeMove),
      setKeyframeMoveTiming: vi.fn(({ delay, followingDelay }) => {
        keyframeMove.delay = delay;
        keyframeMove.followingDelay = followingDelay;
      }),
      startKeyframeMove: vi.fn((move) => {
        keyframeMove = {
          ...move,
          delay: move.startDelay,
          dragged: false,
          followingDelay: move.startFollowingDelay,
        };
      }),
    };
    const dispatchEvent = vi.fn();
    const render = vi.fn();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const releasePointerCapture = vi.fn();
    const setPointerCapture = vi.fn();
    const trackElement = {
      getBoundingClientRect: () => ({ width: 400 }),
    };
    const keyframeElement = {
      closest: vi.fn(() => trackElement),
      dataset: {
        property: "x",
        index: "0",
      },
      releasePointerCapture,
      setPointerCapture,
    };
    const deps = {
      dispatchEvent,
      props: {
        editable: true,
        side: "update",
        properties: {
          x: {
            keyframes: [
              { delay: 200, duration: 600 },
              { delay: 300, duration: 500 },
            ],
          },
        },
      },
      render,
      store,
    };

    handleKeyframeMoveStart(deps, {
      _event: {
        button: 0,
        clientX: 100,
        currentTarget: keyframeElement,
        pointerId: 11,
        preventDefault,
        stopPropagation,
      },
    });
    handleKeyframeMove(deps, {
      _event: {
        clientX: -100,
        pointerId: 11,
        preventDefault,
        stopPropagation,
      },
    });
    handleKeyframeMove(deps, {
      _event: {
        clientX: 200,
        pointerId: 11,
        preventDefault,
        stopPropagation,
      },
    });
    handleKeyframeMoveEnd(deps, {
      _event: {
        currentTarget: keyframeElement,
        pointerId: 11,
        preventDefault,
        stopPropagation,
      },
    });

    expect(setPointerCapture).toHaveBeenCalledWith(11);
    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({
      type: "keyframe-select",
      detail: {
        property: "x",
        side: "update",
        index: 0,
      },
    });
    expect(store.setKeyframeMoveTiming.mock.calls).toEqual([
      [{ delay: 0, followingDelay: 500 }],
      [{ delay: 500, followingDelay: 0 }],
    ]);
    expect(releasePointerCapture).toHaveBeenCalledWith(11);
    expect(dispatchEvent.mock.calls[1][0]).toMatchObject({
      type: "keyframe-duration-change",
      detail: {
        delay: 500,
        duration: 600,
        followingDelay: 0,
        property: "x",
        side: "update",
        index: 0,
      },
    });
    expect(store.clearKeyframeMove).toHaveBeenCalledWith({
      suppressClick: true,
    });

    handleKeyframeClick(deps, {
      _event: {
        clientX: 200,
        clientY: 100,
        currentTarget: keyframeElement,
        stopPropagation,
      },
    });

    expect(dispatchEvent).toHaveBeenCalledTimes(2);
    expect(store.clearKeyframeClickSuppression).toHaveBeenCalledWith({});
  });
});
