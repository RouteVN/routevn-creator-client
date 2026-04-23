import { describe, expect, it } from "vitest";
import {
  buildLayoutElements,
  extractFileIdsFromRenderState,
} from "../../src/internal/project/layout.js";

const EMPTY_TREE = { items: {}, tree: [] };

const SOUNDS_DATA = {
  items: {
    "sound-hover": {
      id: "sound-hover",
      type: "sound",
      name: "Hover Sound",
      fileId: "file-hover",
      fileType: "audio/ogg",
    },
    "sound-click": {
      id: "sound-click",
      type: "sound",
      name: "Click Sound",
      fileId: "file-click",
      fileType: "audio/mpeg",
    },
  },
  tree: [{ id: "sound-hover" }, { id: "sound-click" }],
};

describe("layout sound variants", () => {
  it("maps text hover and click sound ids into route-graphics interaction sounds", () => {
    const { elements } = buildLayoutElements(
      [
        {
          id: "text-1",
          type: "text",
          text: "Hello",
          x: 0,
          y: 0,
          hoverSoundId: "sound-hover",
          clickSoundId: "sound-click",
        },
      ],
      {},
      EMPTY_TREE,
      EMPTY_TREE,
      EMPTY_TREE,
      {
        layoutId: "layout-1",
        soundsData: SOUNDS_DATA,
      },
    );

    expect(elements[0].hover?.soundSrc).toBe("file-hover");
    expect(elements[0].hover?.soundFileType).toBe("audio/ogg");
    expect(elements[0].click?.soundSrc).toBe("file-click");
    expect(elements[0].click?.soundFileType).toBe("audio/mpeg");

    expect(extractFileIdsFromRenderState(elements)).toEqual([
      {
        url: "file-hover",
        type: "audio/ogg",
      },
      {
        url: "file-click",
        type: "audio/mpeg",
      },
    ]);
  });

  it("maps container hover and click sound ids in the render state", () => {
    const { elements } = buildLayoutElements(
      [
        {
          id: "container-1",
          type: "container",
          x: 0,
          y: 0,
          direction: "absolute",
          hoverSoundId: "sound-hover",
          clickSoundId: "sound-click",
        },
      ],
      {},
      EMPTY_TREE,
      EMPTY_TREE,
      EMPTY_TREE,
      {
        layoutId: "layout-1",
        soundsData: SOUNDS_DATA,
      },
    );

    expect(elements[0].hover?.soundSrc).toBe("file-hover");
    expect(elements[0].click?.soundSrc).toBe("file-click");
  });
});
