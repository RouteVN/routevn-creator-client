import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SUPPORTED_EASING_CURVE_NAMES,
  createKeyframeValueCurvePath,
} from "../../src/components/keyframeTimeline/keyframeTimeline.easing.js";
import {
  clearKeyframeClickSuppression,
  clearKeyframeMove,
  createInitialState,
  markKeyframeMoveDragged,
  selectKeyframeClickSuppressed,
  selectViewData,
  startKeyframeMove,
} from "../../src/components/keyframeTimeline/keyframeTimeline.store.js";

describe("keyframeTimeline easing curves", () => {
  const readPathPoints = (path) => {
    return Array.from(path.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)).map(
      (match) => ({
        x: Number(match[1]),
        y: Number(match[2]),
      }),
    );
  };

  const createPath = ({
    easing = "linear",
    endValue,
    initialValue,
    relative = false,
  } = {}) => {
    return createKeyframeValueCurvePath({
      initialValue,
      keyframes: [
        {
          duration: 1000,
          easing,
          relative,
          value: endValue,
        },
      ],
      timelineDuration: 1000,
    });
  };

  it("creates finite paths for every supported easing", () => {
    const paths = SUPPORTED_EASING_CURVE_NAMES.map((easingName) =>
      createPath({
        easing: easingName,
        endValue: 1,
        initialValue: 0,
      }),
    );

    paths.forEach((path) => {
      expect(path).toMatch(/^M0\.00,/);
      expect(path).not.toMatch(/NaN|Infinity/);
      expect(path.match(/ L/g)).toHaveLength(36);
    });
    expect(
      createPath({
        easing: "easeOutBounce",
        endValue: 1,
        initialValue: 0,
      }),
    ).not.toBe(createPath({ easing: "linear", endValue: 1, initialValue: 0 }));
    expect(
      createPath({ easing: "unsupported", endValue: 1, initialValue: 0 }),
    ).toBe(createPath({ easing: "linear", endValue: 1, initialValue: 0 }));
  });

  it("draws increasing, decreasing, and unchanged values differently", () => {
    const increasingPoints = readPathPoints(
      createPath({ initialValue: 0, endValue: 1 }),
    );
    const decreasingPoints = readPathPoints(
      createPath({ initialValue: 1, endValue: 0 }),
    );
    const unchangedPoints = readPathPoints(
      createPath({ initialValue: 0, endValue: 0 }),
    );

    expect(increasingPoints[0].y).toBeGreaterThan(increasingPoints.at(-1).y);
    expect(decreasingPoints[0].y).toBeLessThan(decreasingPoints.at(-1).y);
    expect(new Set(unchangedPoints.map((point) => point.y))).toEqual(
      new Set([10]),
    );

    const defaultValuePoints = readPathPoints(
      createKeyframeValueCurvePath({
        defaultValue: 1,
        keyframes: [{ duration: 1000, easing: "linear", value: 0 }],
        timelineDuration: 1000,
      }),
    );
    expect(defaultValuePoints[0].y).toBeLessThan(defaultValuePoints.at(-1).y);
  });

  it("accumulates relative values and keeps one value scale across segments", () => {
    const points = readPathPoints(
      createKeyframeValueCurvePath({
        initialValue: 0,
        keyframes: [
          { duration: 500, easing: "linear", value: 1 },
          {
            duration: 500,
            easing: "linear",
            relative: true,
            value: -1,
          },
        ],
        timelineDuration: 1000,
      }),
    );

    expect(points[0]).toEqual({ x: 0, y: 19 });
    expect(points[36]).toEqual({ x: 50, y: 1 });
    expect(points.at(-1)).toEqual({ x: 100, y: 19 });
  });

  it("keeps the value flat during a keyframe delay", () => {
    const points = readPathPoints(
      createKeyframeValueCurvePath({
        initialValue: 0,
        keyframes: [{ delay: 200, duration: 800, easing: "linear", value: 1 }],
        timelineDuration: 1000,
      }),
    );

    expect(points[0]).toEqual({ x: 0, y: 19 });
    expect(points[1]).toEqual({ x: 20, y: 19 });
    expect(points.at(-1)).toEqual({ x: 100, y: 1 });
  });

  it("adds one property value path and easing labels to keyframe tracks", () => {
    const viewData = selectViewData({
      state: createInitialState(),
      props: {
        properties: {
          x: {
            initialValue: 0,
            keyframes: [
              {
                duration: 500,
                easing: "easeOutBounce",
                value: 100,
              },
              {
                duration: 500,
                value: 200,
              },
            ],
          },
          alpha: {
            auto: {
              duration: 1000,
              easing: "easeInOutElastic",
            },
          },
        },
      },
    });

    const keyframeProperty = viewData.selectedProperties[0];
    expect(keyframeProperty.keyframes[0]).toMatchObject({
      easing: "easeOutBounce",
      easingLabel: "Ease Out Bounce",
    });
    expect(keyframeProperty.keyframes[1]).toMatchObject({
      easing: "linear",
      easingLabel: "Linear",
    });
    expect(keyframeProperty.valueCurvePath).toBe(
      createKeyframeValueCurvePath({
        initialValue: 0,
        keyframes: [
          { duration: 500, easing: "easeOutBounce", value: 100 },
          { duration: 500, value: 200 },
        ],
        timelineDuration: 1000,
      }),
    );

    const autoProperty = viewData.selectedProperties[1];
    expect(autoProperty.auto).toMatchObject({
      easing: "easeInOutElastic",
      easingLabel: "Ease In Out Elastic",
    });
    expect(autoProperty.valueCurvePath).toBeUndefined();
  });

  it("uses non-interactive cursors for read-only keyframes", () => {
    const viewData = selectViewData({
      state: createInitialState(),
      props: {
        editable: false,
        properties: {
          x: {
            initialValue: 0,
            keyframes: [{ duration: 500, value: 100 }],
          },
        },
      },
    });

    expect(viewData.editable).toBe(false);
    expect(viewData.selectedProperties[0]).toMatchObject({
      initialValueCursor: "default",
      keyframes: [{ cursor: "default" }],
    });
  });

  it("renders decorative SVG paths without replacing keyframe click targets", () => {
    const view = readFileSync(
      "src/components/keyframeTimeline/keyframeTimeline.view.yaml",
      "utf8",
    );

    expect(view).toContain("data-keyframe=true");
    expect(view).toContain("handler: handleRulerScrubStart");
    expect(view).toContain("handler: handleKeyframeMoveStart");
    expect(view).toContain("handler: handleKeyframeMove");
    expect(view).toContain("handler: handleKeyframeMoveEnd");
    expect(view).toContain("handler: handlePropertyNameRightClick");
    expect(view).not.toContain("handleRulerMouseMove");
    expect(view).not.toContain("$if playheadIndicatorVisible");
    expect(view).toMatch(/w=104 bgc=bg bwr=xs bc=bo[^\n]+position: sticky/);
    expect(view).toContain("left: 0; z-index: 6");
    expect(view).toMatch(/data-keyframe=true[^\n]+br=lg/);
    expect(view).toMatch(/data-keyframe-slot=true[^\n]+flex-shrink: 0/);
    expect(view).toMatch(
      /data-keyframe=true[^\n]+top: 2px; bottom: 2px; left: \$\{keyframe.delayPercent\}%; right: 0/,
    );
    expect(view).toMatch(/data-keyframe=true[^\n]+keyframe.cursor/);
    expect(view).toMatch(
      /data-keyframe-duration-handle=left[^\n]+data-resize-edge=left[^\n]+cursor: ew-resize/,
    );
    expect(view).toMatch(
      /data-keyframe-duration-handle=right[^\n]+cursor: ew-resize/,
    );
    expect(view.indexOf("$if editable:")).toBeLessThan(
      view.indexOf("data-keyframe-duration-handle=left"),
    );
    expect(view).toMatch(/durationHandle[^\n]+[\s\S]+pos=abs bgc=fg/);
    expect(view).toContain("top: 5px; bottom: 5px; left: 6px; width: 1px");
    expect(view).toContain("top: 5px; bottom: 5px; right: 6px; width: 1px");
    expect(view).toMatch(
      /rtgl-text[^\n]+ta=e[^\n]+left: 10px; right: 13px[^\n]+keyframe.value/,
    );
    expect(view).not.toContain("property.hoverTarget.mode != 'empty'");
    expect(view).toContain("data-value-curve=${property.name}");
    expect(view).toContain('d="${property.valueCurvePath}"');
    expect(view).toContain("pointer-events: none");
    expect(view).toMatch(/data-value-curve=[^\n]+z-index: 3/);
    expect(view.match(/data-keyframe=true[^\n]+/g)).toEqual([
      expect.not.stringContaining("mr=xs"),
    ]);
  });

  it("marks only the matching keyframe as selected", () => {
    const viewData = selectViewData({
      state: createInitialState(),
      props: {
        side: "next",
        selectedKeyframe: {
          side: "next",
          property: "x",
          index: 1,
        },
        properties: {
          x: {
            keyframes: [
              { duration: 100, easing: "linear", value: 10 },
              { duration: 100, easing: "linear", value: 20 },
            ],
          },
        },
      },
    });

    expect(viewData.selectedProperties[0].keyframes).toMatchObject([
      {
        selected: false,
        backgroundColor: "ac",
        foregroundColor: "ac-fg",
      },
      {
        selected: true,
        backgroundColor: "ac",
        foregroundColor: "ac-fg",
        borderColor: "var(--ring)",
      },
    ]);
  });

  it("marks only the matching property label as selected", () => {
    const viewData = selectViewData({
      state: createInitialState(),
      props: {
        side: "prev",
        selectedProperty: { side: "prev", property: "alpha" },
        properties: {
          alpha: { keyframes: [{ duration: 100, value: 1 }] },
          x: { keyframes: [{ duration: 100, value: 10 }] },
        },
      },
    });

    expect(viewData.selectedProperties).toMatchObject([
      { name: "alpha", selected: true, nameColor: "pr" },
      { name: "x", selected: false, nameColor: "fg" },
    ]);
  });

  it("previews the duration being resized", () => {
    const state = createInitialState();
    state.durationResize = {
      property: "x",
      index: 0,
      delay: 0,
      duration: 750,
      timelineDuration: 1000,
    };

    const viewData = selectViewData({
      state,
      props: {
        side: "next",
        properties: {
          x: {
            keyframes: [
              { duration: 500, easing: "linear", value: 10 },
              { duration: 500, easing: "linear", value: 20 },
            ],
          },
        },
      },
    });

    expect(viewData.selectedProperties[0].keyframes).toMatchObject([
      { duration: 750, widthPercent: "75.00" },
      { duration: 500, widthPercent: "50.00" },
    ]);
  });

  it("previews delay and duration while the start marker is resized", () => {
    const state = createInitialState();
    state.durationResize = {
      property: "x",
      index: 0,
      delay: 250,
      duration: 250,
      timelineDuration: 1000,
    };

    const viewData = selectViewData({
      state,
      props: {
        editable: true,
        side: "update",
        properties: {
          x: {
            keyframes: [
              { duration: 500, easing: "linear", value: 10 },
              { duration: 500, easing: "linear", value: 20 },
            ],
          },
        },
      },
    });

    expect(viewData.selectedProperties[0].keyframes).toMatchObject([
      {
        delay: 250,
        delayPercent: "50.00",
        duration: 250,
        widthPercent: "50.00",
      },
      { delay: 0, duration: 500, widthPercent: "50.00" },
    ]);
  });

  it("previews a keyframe move by offsetting the following delay", () => {
    const state = createInitialState();
    state.keyframeMove = {
      property: "x",
      index: 0,
      delay: 400,
      followingDelay: 100,
      duration: 600,
      timelineDuration: 1600,
    };

    const viewData = selectViewData({
      state,
      props: {
        editable: true,
        side: "update",
        properties: {
          x: {
            keyframes: [
              { delay: 200, duration: 600, easing: "linear", value: 10 },
              { delay: 300, duration: 500, easing: "linear", value: 20 },
            ],
          },
        },
      },
    });

    expect(viewData.selectedProperties[0]).toMatchObject({
      propertyWidthPercent: "100.00",
      keyframes: [
        {
          cursor: "grabbing",
          delay: 400,
          delayPercent: "40.00",
          duration: 600,
          widthPercent: "62.50",
        },
        {
          delay: 100,
          delayPercent: "16.67",
          duration: 500,
          widthPercent: "37.50",
        },
      ],
    });
  });

  it("shows the committed playhead time in the ruler", () => {
    const viewData = selectViewData({
      state: createInitialState(),
      props: {
        indicatorVisible: true,
        indicatorTimeMs: 500,
        showRuler: true,
        timelineDuration: 1000,
        properties: {
          x: {
            keyframes: [{ duration: 1000, value: 10 }],
          },
        },
      },
    });

    expect(viewData.rulerIndicatorVisible).toBe(true);
    expect(viewData.playheadIndicatorTimeLabel).toBe("500 ms");
  });
});

describe("keyframeTimeline gesture state", () => {
  it("suppresses the click following a completed keyframe drag", () => {
    const state = createInitialState();

    startKeyframeMove(
      { state },
      {
        pointerId: 1,
        property: "x",
        index: 0,
        startX: 100,
        startDelay: 0,
        duration: 1000,
        timelineDuration: 1000,
        trackWidth: 200,
      },
    );
    markKeyframeMoveDragged({ state });
    clearKeyframeMove({ state }, { suppressClick: true });

    expect(selectKeyframeClickSuppressed({ state })).toBe(true);

    clearKeyframeClickSuppression({ state });
    expect(selectKeyframeClickSuppressed({ state })).toBe(false);
  });
});
