import { describe, expect, it } from "vitest";
import {
  createSceneCanvasFileName,
  dataUrlToBlob,
} from "../../src/pages/sceneEditorLexical/support/sceneCanvasDownload.js";

describe("scene canvas download", () => {
  it("uses a compact timestamp without user-authored content", () => {
    expect(createSceneCanvasFileName(new Date(2026, 6, 20, 12, 58, 7))).toBe(
      "scene-canvas-20260720-125807.png",
    );
  });

  it("decodes a PNG data URL into a blob", async () => {
    const blob = dataUrlToBlob("data:image/png;base64,aGVsbG8=");

    expect(blob.type).toBe("image/png");
    expect(await blob.text()).toBe("hello");
  });
});
