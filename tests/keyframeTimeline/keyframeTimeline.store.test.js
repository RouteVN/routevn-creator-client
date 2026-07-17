import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SUPPORTED_EASING_CURVE_NAMES,
  createKeyframeValueCurvePath,
} from "../../src/components/keyframeTimeline/keyframeTimeline.easing.js";
import {
  createInitialState,
  selectViewData,
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

  it("renders decorative SVG paths without replacing keyframe click targets", () => {
    const view = readFileSync(
      "src/components/keyframeTimeline/keyframeTimeline.view.yaml",
      "utf8",
    );

    expect(view).toContain("data-keyframe=true");
    expect(view).toContain("data-value-curve=${property.name}");
    expect(view).toContain('d="${property.valueCurvePath}"');
    expect(view).toContain("pointer-events: none");
    expect(view.match(/data-keyframe=true[^\n]+/g)).toEqual([
      expect.not.stringContaining("mr=xs"),
    ]);
  });
});
