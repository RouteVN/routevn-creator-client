import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectRenderedSize,
  selectViewData,
  setRenderedSize,
} from "../../src/components/waveformVisualizer/waveformVisualizer.store.js";

describe("waveformVisualizer.store", () => {
  it("changes the waveform render key with the rendered size", () => {
    const state = createInitialState();

    setRenderedSize({ state }, { width: 640, height: 360 });

    expect(selectRenderedSize({ state })).toEqual({
      width: 640,
      height: 360,
    });
    expect(selectViewData({ state, props: { w: "f", h: "f" } })).toMatchObject({
      w: "f",
      h: "f",
      waveformRenderKey: "waveform640x360",
    });
  });
});
