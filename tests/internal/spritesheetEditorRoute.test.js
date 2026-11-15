import { describe, expect, it } from "vitest";
import {
  createSpritesheetEditorPayload,
  resolveSpritesheetEditorPayload,
} from "../../src/internal/spritesheetEditorRoute.js";

describe("spritesheet editor route", () => {
  it("opens a spritesheet even when the route still names a character", () => {
    // Character pages keep `characterId` in the route after leaving them.
    const payload = createSpritesheetEditorPayload({
      payload: { p: "project-1", characterId: "hero" },
      spritesheetId: "walk",
    });

    expect(resolveSpritesheetEditorPayload(payload)).toEqual({
      spritesheetId: "walk",
      characterId: undefined,
      spriteId: undefined,
    });
  });

  it("opens a character's spritesheet sprite", () => {
    const payload = createSpritesheetEditorPayload({
      payload: { p: "project-1", ss: "walk" },
      characterId: "hero",
      spriteId: "run",
    });

    expect(payload).toEqual({
      p: "project-1",
      characterId: "hero",
      sprite: "run",
    });
    expect(resolveSpritesheetEditorPayload(payload)).toEqual({
      spritesheetId: undefined,
      characterId: "hero",
      spriteId: "run",
    });
  });
});
