import { describe, expect, it } from "vitest";
import {
  createAudioTimelineLayout,
  createAudioTimelineSnapStartDelays,
  resolveAudioInsertionTiming,
  resolveDraggedAudioStartDelayMs,
} from "../../src/internal/audioTimeline.js";

const resourceById = new Map([
  ["short", { id: "short", duration: 2 }],
  ["long", { id: "long", duration: 6 }],
]);

describe("audioTimeline", () => {
  it("uses absolute start times and separates overlapping sounds into lanes", () => {
    const timeline = createAudioTimelineLayout({
      sounds: [
        { id: "short-clip", resourceId: "short", startDelayMs: 0 },
        { id: "long-clip", resourceId: "long", startDelayMs: 1000 },
      ],
      resourceById,
    });

    expect(timeline.channelDurationMs).toBe(7000);
    expect(timeline.laneCount).toBe(2);
    expect(
      timeline.sounds.map((sound) => ({
        id: sound.sound.id,
        laneIndex: sound.laneIndex,
        leftPercent: sound.leftPercent,
      })),
    ).toEqual([
      { id: "short-clip", laneIndex: 0, leftPercent: "0.0000" },
      { id: "long-clip", laneIndex: 1, leftPercent: "14.2857" },
    ]);
  });

  it("keeps non-overlapping sounds in one lane", () => {
    const timeline = createAudioTimelineLayout({
      sounds: [
        { id: "short-clip", resourceId: "short", startDelayMs: 0 },
        { id: "long-clip", resourceId: "long", startDelayMs: 2000 },
      ],
      resourceById,
    });

    expect(timeline.channelDurationMs).toBe(8000);
    expect(timeline.laneCount).toBe(1);
  });

  it("makes room when a sound is inserted at a timeline boundary", () => {
    expect(
      resolveAudioInsertionTiming({
        sounds: [{ id: "long-clip", resourceId: "long", startDelayMs: 0 }],
        index: 0,
        sound: { id: "short-clip", resourceId: "short" },
        resourceById,
      }),
    ).toEqual({
      startDelayMs: 0,
      shiftMs: 2000,
    });
  });

  it("snaps horizontal dragging to 10 milliseconds", () => {
    expect(
      resolveDraggedAudioStartDelayMs({
        originStartDelayMs: 250,
        originClientX: 100,
        clientX: 151,
        timelineDurationMs: 2000,
        timelineWidthPx: 400,
      }),
    ).toBe(510);
  });

  it("creates snap positions for matching either edge with other clips", () => {
    expect(
      createAudioTimelineSnapStartDelays({
        sounds: [
          { id: "short-clip", resourceId: "short", startDelayMs: 0 },
          { id: "long-clip", resourceId: "long", startDelayMs: 5000 },
        ],
        soundId: "short-clip",
        resourceById,
      }),
    ).toEqual([0, 3000, 5000, 9000, 11000]);
  });

  it("magnetically snaps a dragged clip to a nearby boundary", () => {
    expect(
      resolveDraggedAudioStartDelayMs({
        originStartDelayMs: 0,
        originClientX: 0,
        clientX: 97,
        timelineDurationMs: 10000,
        timelineWidthPx: 500,
        snapStartDelaysMs: [0, 2000],
      }),
    ).toBe(2000);
  });
});
