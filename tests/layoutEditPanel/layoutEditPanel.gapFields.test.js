import { describe, expect, it } from "vitest";
import { toInspectorValues } from "../../src/components/layoutEditPanel/support/layoutEditPanelViewData.js";

describe("layoutEditPanel spacing axes", () => {
  it("maps anchor coordinates to the inspector anchor value", () => {
    const values = toInspectorValues({
      values: {
        type: "sprite",
        anchorX: 0,
        anchorY: 0,
      },
      firstTextStyleId: "",
      hiddenActionModes: new Set(),
    });

    expect(values.anchor).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("defaults missing anchor coordinates to top left", () => {
    const values = toInspectorValues({
      values: {
        type: "sprite",
      },
      firstTextStyleId: "",
      hiddenActionModes: new Set(),
    });

    expect(values.anchor).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("shows absolute as the default direction for containers", () => {
    const values = toInspectorValues({
      values: {
        type: "container",
      },
      firstTextStyleId: "",
      hiddenActionModes: new Set(),
    });

    expect(values.direction).toBe("absolute");
  });

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
