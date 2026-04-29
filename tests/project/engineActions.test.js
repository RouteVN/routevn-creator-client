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
});
