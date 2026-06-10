import { describe, expect, it } from "vitest";
import {
  buildLayoutElements,
  extractFileIdsFromRenderState,
} from "../../src/internal/project/layout.js";

const emptyCollection = { items: {}, tree: [] };

describe("dialogue layout projection", () => {
  it("projects ADV dialogue content for append-compatible text reveal", () => {
    const { elements } = buildLayoutElements(
      [
        {
          id: "dialogue-text",
          type: "text-revealing-ref-dialogue-content",
          revealEffect: "typewriter",
        },
      ],
      {},
      emptyCollection,
      emptyCollection,
      emptyCollection,
      { layoutId: "layout-1" },
    );

    expect(elements[0]).toMatchObject({
      id: "dialogue-text",
      type: "text-revealing",
      content: "${dialogue.content}",
      initialRevealedCharacters: "${dialogue.initialRevealedCharacters}",
      speed: "${dialogue.textSpeed}",
      revealEffect: "typewriter",
    });
  });

  it("projects text reveal indicator image refs for ADV dialogue content", () => {
    const imageItems = {
      "image-revealing": {
        id: "image-revealing",
        type: "image",
        fileId: "file-revealing",
      },
      "image-complete": {
        id: "image-complete",
        type: "image",
        fileId: "file-complete",
      },
    };
    const { elements } = buildLayoutElements(
      [
        {
          id: "dialogue-text",
          type: "text-revealing-ref-dialogue-content",
          indicator: {
            revealing: {
              imageId: "image-revealing",
              width: 12,
              height: 13,
              offsetX: 16,
              offsetY: -4,
            },
            complete: {
              imageId: "image-complete",
              width: 14,
              height: 15,
              offsetX: 24,
              offsetY: 3,
            },
          },
        },
      ],
      imageItems,
      emptyCollection,
      emptyCollection,
      emptyCollection,
      { layoutId: "layout-1" },
    );

    expect(elements[0].indicator).toEqual({
      revealing: {
        kind: "image",
        src: "file-revealing",
        width: 12,
        height: 13,
        offsetX: 16,
        offsetY: -4,
      },
      complete: {
        kind: "image",
        src: "file-complete",
        width: 14,
        height: 15,
        offsetX: 24,
        offsetY: 3,
      },
    });
    expect(extractFileIdsFromRenderState(elements)).toEqual([
      {
        url: "file-revealing",
        type: "image/png",
      },
      {
        url: "file-complete",
        type: "image/png",
      },
    ]);
  });

  it("projects text reveal indicator spritesheet refs for ADV dialogue content", () => {
    const spritesheetsData = {
      items: {
        "sheet-indicator": {
          id: "sheet-indicator",
          type: "spritesheet",
          fileId: "file-sheet",
          jsonData: {
            frames: {
              "blink-0": {
                frame: {
                  x: 0,
                  y: 0,
                  w: 18,
                  h: 20,
                },
              },
            },
          },
          animations: {
            blink: {
              frames: ["blink-0"],
              fps: 12,
              loop: true,
            },
          },
        },
      },
      tree: [{ id: "sheet-indicator", children: [] }],
    };
    const { elements } = buildLayoutElements(
      [
        {
          id: "dialogue-text",
          type: "text-revealing-ref-dialogue-content",
          indicator: {
            revealing: {
              kind: "spritesheet",
              resourceId: "sheet-indicator",
              animationName: "blink",
              width: 18,
              height: 20,
              offsetX: 16,
              offsetY: 0,
            },
          },
        },
      ],
      {},
      emptyCollection,
      emptyCollection,
      emptyCollection,
      { layoutId: "layout-1", spritesheetsData },
    );

    expect(elements[0].indicator).toEqual({
      revealing: {
        kind: "spritesheet",
        src: "file-sheet",
        atlas: spritesheetsData.items["sheet-indicator"].jsonData,
        clips: {
          blink: ["blink-0"],
        },
        playback: {
          autoplay: true,
          fps: 12,
          loop: true,
          clip: "blink",
        },
        width: 18,
        height: 20,
        offsetX: 16,
        offsetY: 0,
      },
    });
  });
});
