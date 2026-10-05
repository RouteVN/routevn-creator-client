import { describe, expect, it } from "vitest";
import {
  createParticleEditorPayload,
  getParticleEditorBackPath,
  resolveParticleEditorPayload,
} from "../../src/internal/particleEditorRoute.js";

describe("particle editor route", () => {
  it("keeps the particle id in the pt payload key", () => {
    const payload = createParticleEditorPayload({
      payload: { p: "project-1", pt: "old" },
      particleId: "particle-1",
    });

    expect(payload).toEqual({ p: "project-1", pt: "particle-1" });
    expect(resolveParticleEditorPayload(payload)).toEqual({
      particleId: "particle-1",
    });
  });

  it("drops the particle id on the way back to the particles page", () => {
    expect(
      createParticleEditorPayload({ payload: { p: "project-1", pt: "old" } }),
    ).toEqual({ p: "project-1" });
    expect(resolveParticleEditorPayload({ pt: "" })).toEqual({
      particleId: undefined,
    });
    expect(getParticleEditorBackPath()).toBe("/project/particles");
  });
});
