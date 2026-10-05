import { describe, expect, it } from "vitest";
import {
  createTransformEditorPayload,
  getTransformEditorBackPath,
  resolveTransformEditorPayload,
} from "../../src/internal/transformEditorRoute.js";

describe("transform editor route", () => {
  it("keeps the transform id in the t payload key", () => {
    const payload = createTransformEditorPayload({
      payload: { p: "project-1", t: "old" },
      transformId: "transform-1",
    });

    expect(payload).toEqual({ p: "project-1", t: "transform-1" });
    expect(resolveTransformEditorPayload(payload)).toEqual({
      transformId: "transform-1",
    });
  });

  it("drops the transform id on the way back to the transforms page", () => {
    expect(
      createTransformEditorPayload({ payload: { p: "project-1", t: "old" } }),
    ).toEqual({ p: "project-1" });
    expect(resolveTransformEditorPayload({ t: "" })).toEqual({
      transformId: undefined,
    });
    expect(getTransformEditorBackPath()).toBe("/project/transforms");
  });
});
