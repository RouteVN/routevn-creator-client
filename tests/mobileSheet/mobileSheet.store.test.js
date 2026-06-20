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
