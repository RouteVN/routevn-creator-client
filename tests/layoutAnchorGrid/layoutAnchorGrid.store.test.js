import { describe, expect, it } from "vitest";
import { selectViewData } from "../../src/components/layout-anchor-grid/layout-anchor-grid.store.js";

const OPTIONS = [
  { label: "Top Left", value: { x: 0, y: 0 } },
  { label: "Top Center", value: { x: 0.5, y: 0 } },
  { label: "Top Right", value: { x: 1, y: 0 } },
  { label: "Center Left", value: { x: 0, y: 0.5 } },
  { label: "Center", value: { x: 0.5, y: 0.5 } },
  { label: "Center Right", value: { x: 1, y: 0.5 } },
  { label: "Bottom Left", value: { x: 0, y: 1 } },
  { label: "Bottom Center", value: { x: 0.5, y: 1 } },
  { label: "Bottom Right", value: { x: 1, y: 1 } },
];

describe("layoutAnchorGrid store", () => {
  it("selects the matching anchor cell and makes it tabbable", () => {
    const viewData = selectViewData({
      props: {
        label: "Anchor",
        options: OPTIONS,
        value: { x: 0.5, y: 1 },
      },
    });

    expect(viewData.cells).toHaveLength(9);
    expect(viewData.cells[7]).toMatchObject({
      isSelected: true,
      label: "Bottom Center",
      tabIndex: 0,
      value: { x: 0.5, y: 1 },
    });
    expect(viewData.cells.filter((cell) => cell.tabIndex === 0)).toHaveLength(
      1,
    );
  });

  it("makes the first cell tabbable when the value is not recognized", () => {
    const viewData = selectViewData({
      props: {
        options: OPTIONS,
        value: { x: 0.25, y: 0.25 },
      },
    });

    expect(viewData.cells[0].tabIndex).toBe(0);
    expect(viewData.cells.some((cell) => cell.isSelected)).toBe(false);
  });
});
