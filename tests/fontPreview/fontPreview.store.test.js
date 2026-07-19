import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
} from "../../src/components/fontPreview/fontPreview.store.js";

describe("fontPreview.store", () => {
  it("builds the Route Graphics text style with shadow", () => {
    const viewData = selectViewData({
      state: createInitialState(),
      props: {
        mode: "live",
        fileId: "font-file",
        shadowColor: "#123456",
        shadowAlpha: "0.75",
        shadowBlur: "6",
        shadowOffsetX: "-2",
        shadowOffsetY: "3",
      },
    });

    expect(viewData.routeGraphicsPreview).toMatchObject({
      mode: "live",
      textStyle: {
        fontFamily: "font-file",
        shadow: {
          color: "#123456",
          alpha: 0.75,
          blur: 6,
          offsetX: -2,
          offsetY: 3,
        },
      },
    });
    expect(viewData.routeGraphicsPreview.textStyle).not.toHaveProperty(
      "fontStyle",
    );
  });

  it("keeps Route Graphics shadow independent when the outline is removed", () => {
    const viewData = selectViewData({
      state: createInitialState(),
      props: {
        strokeColor: "undefined",
        strokeWidth: "0",
        shadowColor: "#123456",
        shadowAlpha: "1",
        shadowBlur: "4",
        shadowOffsetX: "2",
        shadowOffsetY: "3",
      },
    });

    expect(viewData.routeGraphicsPreview.textStyle.strokeColor).toBe(
      "transparent",
    );
    expect(viewData.routeGraphicsPreview.textStyle.strokeWidth).toBe(0);
    expect(viewData.routeGraphicsPreview.textStyle.shadow).toEqual({
      color: "#123456",
      alpha: 1,
      blur: 4,
      offsetX: 2,
      offsetY: 3,
    });
  });

  it("omits Route Graphics shadow when no shadow color is selected", () => {
    const viewData = selectViewData({
      state: createInitialState(),
      props: {
        shadowColor: "undefined",
        shadowBlur: "12",
      },
    });

    expect(viewData.routeGraphicsPreview.textStyle).not.toHaveProperty(
      "shadow",
    );
  });
});
