import { afterEach, describe, expect, it, vi } from "vitest";
import { captureGraphicsThumbnailImage } from "../../src/internal/runtime/graphicsEngineRuntime.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("captureGraphicsThumbnailImage", () => {
  it("scales the frame's pixels into a JPEG thumbnail without a full-size PNG", async () => {
    const context = { clearRect: vi.fn(), drawImage: vi.fn() };
    const thumbnailCanvas = {
      getContext: vi.fn(() => context),
      toDataURL: vi.fn(() => "data:image/jpeg;base64,dGh1bWI="),
      remove: vi.fn(),
    };
    vi.stubGlobal("document", { createElement: () => thumbnailCanvas });
    const frame = { width: 1920, height: 1080 };
    const graphicsService = {
      extractCanvas: vi.fn(async () => frame),
      extractBase64: vi.fn(),
    };

    await expect(captureGraphicsThumbnailImage(graphicsService)).resolves.toBe(
      "data:image/jpeg;base64,dGh1bWI=",
    );

    expect(graphicsService.extractBase64).not.toHaveBeenCalled();
    // At most 400 by 225, keeping the frame's shape.
    expect([thumbnailCanvas.width, thumbnailCanvas.height]).toEqual([400, 225]);
    expect(context.drawImage).toHaveBeenCalledWith(frame, 0, 0, 400, 225);
    expect(thumbnailCanvas.toDataURL).toHaveBeenCalledWith("image/jpeg", 0.75);
  });
});
