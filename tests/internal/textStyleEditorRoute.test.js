import { describe, expect, it } from "vitest";
import {
  createTextStyleEditorPayload,
  getTextStyleEditorBackPath,
  resolveTextStyleEditorPayload,
} from "../../src/internal/textStyleEditorRoute.js";

describe("text style editor route", () => {
  it("keeps the text style id in the ts payload key", () => {
    const payload = createTextStyleEditorPayload({
      payload: { p: "project-1", ts: "old" },
      textStyleId: "text-style-1",
    });

    expect(payload).toEqual({ p: "project-1", ts: "text-style-1" });
    expect(resolveTextStyleEditorPayload(payload)).toEqual({
      textStyleId: "text-style-1",
    });
  });

  it("drops the text style id on the way back to the text styles page", () => {
    expect(
      createTextStyleEditorPayload({ payload: { p: "project-1", ts: "old" } }),
    ).toEqual({ p: "project-1" });
    expect(resolveTextStyleEditorPayload({ ts: "" })).toEqual({
      textStyleId: undefined,
    });
    expect(getTextStyleEditorBackPath()).toBe("/project/text-styles");
  });
});
