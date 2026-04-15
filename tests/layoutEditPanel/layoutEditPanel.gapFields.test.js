import { describe, expect, it } from "vitest";
import { toInspectorValues } from "../../src/components/layoutEditPanel/support/layoutEditPanelViewData.js";

describe("layoutEditPanel spacing axes", () => {
  it("defaults both spacing axes to zero in inspector values", () => {
    const values = toInspectorValues({
      values: {
        direction: "vertical",
      },
      firstTextStyleId: "",
      hiddenActionModes: new Set(),
    });

    expect(values.gapX).toBe(0);
    expect(values.gapY).toBe(0);
  });

  it("preserves explicit spacing axis values in inspector values", () => {
    const values = toInspectorValues({
      values: {
        direction: "horizontal",
        gapX: 32,
        gapY: 12,
      },
      firstTextStyleId: "",
      hiddenActionModes: new Set(),
    });

    expect(values.gapX).toBe(32);
    expect(values.gapY).toBe(12);
  });
});
