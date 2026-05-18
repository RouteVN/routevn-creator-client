import { describe, expect, it } from "vitest";
import { normalizeLineActions } from "../../src/internal/project/engineActions.js";

describe("normalizeLineActions", () => {
  it("keeps pure dialogue clear actions", () => {
    expect(
      normalizeLineActions({
        dialogue: {
          clear: true,
        },
      }),
    ).toEqual({
      dialogue: {
        clear: true,
      },
    });
  });

  it("removes stale dialogue clear when dialogue data is present", () => {
    expect(
      normalizeLineActions({
        dialogue: {
          clear: true,
          mode: "adv",
          character: {
            sprite: {
              transformId: "portrait-left",
              items: [{ id: "base", resourceId: "sprite-base" }],
            },
          },
        },
      }),
    ).toEqual({
      dialogue: {
        mode: "adv",
        character: {
          sprite: {
            transformId: "portrait-left",
            items: [{ id: "base", resourceId: "sprite-base" }],
          },
        },
      },
    });
  });

  it("normalizes background blur kernel size to a supported route-graphics value", () => {
    expect(
      normalizeLineActions({
        background: {
          resourceId: "bg-school",
          blur: {
            x: 12,
            y: 12,
            quality: 5,
            kernelSize: 12,
            repeatEdgePixels: true,
          },
        },
      }),
    ).toEqual({
      background: {
        resourceId: "bg-school",
        blur: {
          x: 12,
          y: 12,
          quality: 5,
          kernelSize: 11,
          repeatEdgePixels: true,
        },
      },
    });
  });

  it("normalizes screen blur kernel size to a supported route-graphics value", () => {
    expect(
      normalizeLineActions({
        screen: {
          animations: {
            resourceId: "screen-crossfade",
          },
          blur: {
            x: 12,
            y: 12,
            quality: 5,
            kernelSize: 12,
            repeatEdgePixels: true,
          },
        },
      }),
    ).toEqual({
      screen: {
        animations: {
          resourceId: "screen-crossfade",
        },
        blur: {
          x: 12,
          y: 12,
          quality: 5,
          kernelSize: 11,
          repeatEdgePixels: true,
        },
      },
    });
  });

  it("normalizes visual and character item blur kernel sizes", () => {
    expect(
      normalizeLineActions({
        visual: {
          items: [
            {
              id: "visual-1",
              resourceId: "cg-1",
              blur: {
                x: 10,
                y: 10,
                quality: 3,
                kernelSize: 12,
                repeatEdgePixels: true,
              },
            },
          ],
        },
        character: {
          items: [
            {
              id: "character-1",
              sprites: [],
              blur: {
                x: 10,
                y: 10,
                quality: 3,
                kernelSize: 14,
                repeatEdgePixels: false,
              },
            },
          ],
        },
      }),
    ).toEqual({
      visual: {
        items: [
          {
            id: "visual-1",
            resourceId: "cg-1",
            blur: {
              x: 10,
              y: 10,
              quality: 3,
              kernelSize: 11,
              repeatEdgePixels: true,
            },
          },
        ],
      },
      character: {
        items: [
          {
            id: "character-1",
            sprites: [],
            blur: {
              x: 10,
              y: 10,
              quality: 3,
              kernelSize: 13,
              repeatEdgePixels: false,
            },
          },
        ],
      },
    });
  });
});
