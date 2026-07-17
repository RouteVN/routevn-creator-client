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
  it("keys the waveform by its latest rendered size", () => {
    expect(viewSource).toContain(
      "rtgl-waveform id=${waveformRenderKey} :waveformData=${waveformData}",
    );
    expect(viewSource).toContain("rtgl-view#waveformContainer");
  });
});
