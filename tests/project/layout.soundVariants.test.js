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
    "sound-reveal": {
      id: "sound-reveal",
      type: "sound",
      name: "Reveal Sound",
      fileId: "file-reveal",
      fileType: "audio/wav",
    },
  },
  tree: [{ id: "sound-hover" }, { id: "sound-click" }, { id: "sound-reveal" }],
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
          hover: {
            soundVolume: 40,
          },
          click: {
            soundVolume: 65,
          },
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
    expect(elements[0].hover?.soundVolume).toBe(40);
    expect(elements[0].click?.soundSrc).toBe("file-click");
    expect(elements[0].click?.soundFileType).toBe("audio/mpeg");
    expect(elements[0].click?.soundVolume).toBe(65);

    expect(extractFileIdsFromRenderState(elements)).toEqual(
      expect.arrayContaining([
        {
          url: "file-hover",
          type: "audio/ogg",
        },
        {
          url: "file-click",
          type: "audio/mpeg",
        },
      ]),
    );
    expect(extractFileIdsFromRenderState(elements)).toHaveLength(2);
  });

  it("maps sprite hover and click sound ids into route-graphics interaction sounds", () => {
    const { elements } = buildLayoutElements(
      [
        {
          id: "sprite-1",
          type: "sprite",
          imageId: "image-1",
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

    expect(elements[0].type).toBe("sprite");
    expect(elements[0].hover?.soundSrc).toBe("file-hover");
    expect(elements[0].click?.soundSrc).toBe("file-click");
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

  it("maps text reveal sound ids into route-graphics revealSound config", () => {
    const { elements } = buildLayoutElements(
      [
        {
          id: "text-reveal-1",
          type: "text-revealing",
          text: "Hello",
          x: 0,
          y: 0,
          revealSoundId: "sound-reveal",
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

    expect(elements[0].revealSound).toEqual({
      src: "file-reveal",
      fileType: "audio/wav",
      stopTiming: "immediate",
    });
    expect(extractFileIdsFromRenderState(elements)).toContainEqual({
      url: "file-reveal",
      type: "audio/wav",
    });
  });

  it("maps loop-end text reveal sound stop timing into route-graphics config", () => {
    const { elements } = buildLayoutElements(
      [
        {
          id: "text-reveal-1",
          type: "text-revealing",
          text: "Hello",
          x: 0,
          y: 0,
          revealSoundId: "sound-reveal",
          revealSoundStopTiming: "loopEnd",
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

    expect(elements[0].revealSound).toEqual({
      src: "file-reveal",
      fileType: "audio/wav",
      stopTiming: "loopEnd",
    });
  });
});
