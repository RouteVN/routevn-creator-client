import { describe, expect, it } from "vitest";
import { createThumbnailSourceHash } from "../../src/internal/thumbnailSourceHash.js";

describe("thumbnail source hash", () => {
  it("hashes what a thumbnail is drawn from, whatever the key order", async () => {
    const renderState = {
      id: "editor",
      elements: [{ id: "target", type: "sprite", src: "file-1", x: 10 }],
    };
    const hash = await createThumbnailSourceHash({ version: 1, renderState });

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(
      await createThumbnailSourceHash({
        version: 1,
        renderState: {
          elements: [{ x: 10, src: "file-1", type: "sprite", id: "target" }],
          id: "editor",
        },
      }),
    ).toBe(hash);
    for (const changed of [
      { version: 2, renderState },
      {
        version: 1,
        renderState: {
          ...renderState,
          elements: [{ ...renderState.elements[0], x: 11 }],
        },
      },
      {
        version: 1,
        renderState: {
          ...renderState,
          elements: [{ ...renderState.elements[0], src: "file-2" }],
        },
      },
    ]) {
      expect(await createThumbnailSourceHash(changed)).not.toBe(hash);
    }
  });
});
