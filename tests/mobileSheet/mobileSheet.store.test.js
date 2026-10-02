import { describe, expect, it } from "vitest";
import { selectViewData } from "../../src/components/mobileSheet/mobileSheet.store.js";

describe("mobileSheet.store", () => {
  it("defaults above mobile tab and toolbar layers", () => {
    expect(selectViewData({ props: { open: true } })).toMatchObject({
      open: true,
      overlayZ: "1600",
      sheetZ: "1601",
    });
  });

  it("caps the sheet width by default and lets callers override it", () => {
    // Matches the 640px content column on the Projects page.
    expect(selectViewData({ props: { open: true } }).maxWidth).toBe("640px");
    expect(
      selectViewData({ props: { open: true, maxWidth: "480px" } }).maxWidth,
    ).toBe("480px");
  });

  it("allows callers to override stacking layers", () => {
    expect(
      selectViewData({
        props: {
          open: true,
          overlayZ: "2000",
          sheetZ: "2001",
        },
      }),
    ).toMatchObject({
      overlayZ: "2000",
      sheetZ: "2001",
    });
  });
});
