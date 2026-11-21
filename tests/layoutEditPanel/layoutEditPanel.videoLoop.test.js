import { describe, expect, it } from "vitest";
import { toInspectorValues } from "../../src/components/layoutEditPanel/support/layoutEditPanelViewData.js";

describe("layoutEditPanel video loop", () => {
  it("shows a video without a saved loop as looping, like it plays", () => {
    const values = toInspectorValues({
      values: { type: "video", videoId: "video" },
      firstTextStyleId: "",
      hiddenActionModes: new Set(),
    });

    expect(values.loop).toBe(true);
  });

  it("keeps a saved loop of false", () => {
    const values = toInspectorValues({
      values: { type: "video", videoId: "video", loop: false },
      firstTextStyleId: "",
      hiddenActionModes: new Set(),
    });

    expect(values.loop).toBe(false);
  });
});
