import { describe, expect, it } from "vitest";
import { calculatePopoverPosition } from "../../node_modules/@rettangoli/ui/src/common/popover.js";
import {
  getInlineEndX,
  getInlineStartX,
  getTextDirection,
} from "../../src/internal/textDirection.js";

describe("getTextDirection", () => {
  it.each([
    ["ar", "rtl"],
    ["ur", "rtl"],
    ["fa", "rtl"],
    ["ar-EG", "rtl"],
    ["en", "ltr"],
    ["ja", "ltr"],
    ["zh-Hans", "ltr"],
    ["pa-Guru", "ltr"],
  ])("writes %s as %s", (languageTag, direction) => {
    expect(getTextDirection(languageTag)).toBe(direction);
  });
});

describe("inline edge anchors", () => {
  const rect = { left: 20, right: 64, bottom: 54 };

  it("anchor on the left and right edges in LTR", () => {
    expect(getInlineStartX(rect, "ltr")).toBe(20);
    expect(getInlineEndX(rect, "ltr")).toBe(64);
  });

  it("swap edges in RTL", () => {
    expect(getInlineStartX(rect, "rtl")).toBe(64);
    expect(getInlineEndX(rect, "rtl")).toBe(20);
  });

  // Rettangoli mirrors `place` around the anchor under RTL, so a popover
  // anchored on the inline edge is the mirror image of the LTR one.
  it.each([
    ["bs", getInlineStartX],
    ["be", getInlineEndX],
    ["ts", getInlineStartX],
    ["te", getInlineEndX],
  ])("mirror a %s popover in RTL", (place, getAnchorX) => {
    const viewportWidth = 1000;
    const width = 300;
    const button = { left: 600, right: 644, top: 10, bottom: 54 };
    const mirroredButton = {
      ...button,
      left: viewportWidth - button.right,
      right: viewportWidth - button.left,
    };
    const placePopover = (anchor, direction) =>
      calculatePopoverPosition({
        x: getAnchorX(anchor, direction),
        y: place.startsWith("t") ? anchor.top : anchor.bottom,
        width,
        height: 100,
        place,
        viewportWidth,
        viewportHeight: 800,
        direction,
      });

    const ltr = placePopover(button, "ltr");
    const rtl = placePopover(mirroredButton, "rtl");

    expect(rtl.left).toBe(viewportWidth - ltr.left - width);
    expect(rtl.top).toBe(ltr.top);
  });
});
