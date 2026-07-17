import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("videos view", () => {
  it("keeps the desktop detail thumbnail borderless and display-only", () => {
    const videosView = readFileSync(
      new URL("../../src/pages/videos/videos.view.yaml", import.meta.url),
      "utf8",
    );
    const detailFrameStyleStart = videosView.indexOf(
      '".videoDetailPreviewFrame":',
    );
    const detailFrameStyles = videosView.slice(
      detailFrameStyleStart,
      videosView.indexOf("\ntemplate:", detailFrameStyleStart),
    );

    expect(detailFrameStyleStart).toBeGreaterThan(-1);
    expect(detailFrameStyles).toContain("width: 100%");
    expect(detailFrameStyles).toContain("aspect-ratio: 16 / 9");
    expect(detailFrameStyles).toContain("pointer-events: none");
    expect(detailFrameStyles).not.toContain("padding:");
    expect(detailFrameStyles).not.toContain("box-shadow:");
    expect(videosView).toContain(
      'div#detailVideoPreview.videoDetailPreviewFrame slot="video-thumbnail-file-id"',
    );
    expect(videosView).toContain(
      "rvn-file-image fileId=${selectedPreviewFileId} w=f h=f",
    );
    expect(videosView).not.toContain("detailThumbnail:");
    expect(videosView).not.toContain("detailThumbnailPlaceholder");
    expect(videosView).not.toContain("handler: handleFormExtraEvent");
  });
});
