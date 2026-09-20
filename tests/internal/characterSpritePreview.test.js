import { describe, expect, it } from "vitest";
import { buildCharacterSpritePreviewLayer } from "../../src/internal/characterSpritePreview.js";

describe("character sprite preview sources", () => {
  const image = {
    id: "sprite-one",
    type: "image",
    fileId: "original-one",
    thumbnailFileId: "thumbnail-one",
  };

  it("uses thumbnails for small previews and originals for full previews", () => {
    expect(buildCharacterSpritePreviewLayer(image)).toMatchObject({
      fileId: "thumbnail-one",
      previewKey: "image:sprite-one:thumbnail-one",
    });
    expect(
      buildCharacterSpritePreviewLayer(image, { source: "original" }),
    ).toMatchObject({
      fileId: "original-one",
      previewKey: "image:sprite-one:original-one",
    });
    expect(
      buildCharacterSpritePreviewLayer({ ...image, thumbnailFileId: undefined })
        .fileId,
    ).toBe("original-one");
  });

  it("keeps the original atlas for animated spritesheet previews", () => {
    const animation = { frames: [0, 1], fps: 12 };
    expect(
      buildCharacterSpritePreviewLayer({
        ...image,
        type: "spritesheet",
        jsonData: { frames: [] },
        animations: { idle: animation },
      }),
    ).toMatchObject({ kind: "spritesheet", fileId: "original-one", animation });
  });
});
