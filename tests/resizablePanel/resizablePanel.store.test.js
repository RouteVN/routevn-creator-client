import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setUiConfig,
} from "../../src/components/resizablePanel/resizablePanel.store.js";

const createTouchState = () => {
  const state = createInitialState();
  setUiConfig({ state }, { uiConfig: { inputMode: "touch" } });
  return state;
};

describe("resizablePanel.store", () => {
  it("hides file explorer and detail panels on touch layouts by default", () => {
    const state = createTouchState();

    expect(
      selectViewData({ state, props: { panelType: "detail-panel" } })
        .panelDisplayStyle,
    ).toBe("display: none;");
    expect(
      selectViewData({ state, props: { panelType: "file-explorer" } })
        .panelDisplayStyle,
    ).toBe("display: none;");
  });

  it.each([
    ["", true],
    ["true", true],
  ])("keeps a touch panel visible when show-on-touch is %j", (showOnTouch) => {
    const state = createTouchState();

    expect(
      selectViewData({
        state,
        props: { panelType: "detail-panel", showOnTouch },
      }).panelDisplayStyle,
    ).toBe("overflow: visible;");
  });

  it.each([[false], ["false"]])(
    "still hides a touch panel when show-on-touch is %j",
    (showOnTouch) => {
      const state = createTouchState();

      expect(
        selectViewData({
          state,
          props: { panelType: "detail-panel", showOnTouch },
        }).panelDisplayStyle,
      ).toBe("display: none;");
    },
  );

  it("never hides panels on non-touch layouts", () => {
    const state = createInitialState();

    expect(
      selectViewData({ state, props: { panelType: "detail-panel" } })
        .panelDisplayStyle,
    ).toBe("overflow: visible;");
  });
});
