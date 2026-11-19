import { describe, expect, it } from "vitest";
import { createThumbnailSourceHash } from "../../src/deps/services/shared/thumbnailSourceHash.js";

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

  it("hashes the frame an animation is held at with what is drawn", async () => {
    const renderState = {
      id: "animation",
      elements: [{ id: "target", type: "sprite", src: "file-1" }],
    };
    const animationFrame = {
      resetState: { id: "start", elements: [] },
      timeMs: 500,
      preparationPassCount: 1,
    };
    const hash = await createThumbnailSourceHash({
      version: 1,
      renderState,
      animationFrame,
    });

    // A thumbnail with no frame hashes as it did before frames were hashed.
    expect(hash).not.toBe(
      await createThumbnailSourceHash({ version: 1, renderState }),
    );
    expect(
      await createThumbnailSourceHash({
        version: 1,
        renderState,
        animationFrame: undefined,
      }),
    ).toBe(await createThumbnailSourceHash({ version: 1, renderState }));
    for (const changed of [
      { ...animationFrame, timeMs: 501 },
      { ...animationFrame, preparationPassCount: 2 },
      {
        ...animationFrame,
        resetState: { id: "start", elements: [{ id: "outgoing" }] },
      },
    ]) {
      expect(
        await createThumbnailSourceHash({
          version: 1,
          renderState,
          animationFrame: changed,
        }),
      ).not.toBe(hash);
    }
  });
});
