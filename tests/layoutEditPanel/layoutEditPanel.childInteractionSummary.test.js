import { describe, expect, it } from "vitest";
import { getChildInteractionSummary } from "../../src/components/layoutEditPanel/support/layoutEditPanelChildInteraction.js";
import { EN_I18N, ZH_HANS_I18N } from "../support/i18n.js";

const values = {
  hover: { inheritToChildren: true },
  click: { inheritToChildren: true },
  rightClick: { inheritToChildren: false },
};

describe("getChildInteractionSummary", () => {
  it("lists the inherited interactions with the catalog's separator", () => {
    expect(
      getChildInteractionSummary(
        values,
        EN_I18N.layoutEditPanel,
        EN_I18N.dateTime,
      ),
    ).toBe(
      `${EN_I18N.layoutEditPanel.hoverLabel}, ${EN_I18N.layoutEditPanel.clickLabel}`,
    );
    expect(
      getChildInteractionSummary(
        values,
        ZH_HANS_I18N.layoutEditPanel,
        ZH_HANS_I18N.dateTime,
      ),
    ).toBe("悬停、点击");
  });
});
