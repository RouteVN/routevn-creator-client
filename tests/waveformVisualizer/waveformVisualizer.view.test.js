import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const viewSource = readFileSync(
  new URL(
    "../../src/components/waveformVisualizer/waveformVisualizer.view.yaml",
    import.meta.url,
  ),
  "utf8",
);

describe("waveformVisualizer.view", () => {
  it("owns the resizable waveform canvas", () => {
    expect(viewSource).toContain("canvas#waveformCanvas");
    expect(viewSource).not.toContain("rtgl-waveform");
    expect(viewSource).toContain("rtgl-view#waveformContainer");
  });
});
