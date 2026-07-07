import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
} from "../../src/pages/colors/colors.store.js";
import { EN_I18N } from "../support/i18n.js";

describe("colors.store", () => {
  it("exposes the mobile edit button label", () => {
    const state = createInitialState();
    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.editButton).toBe("Edit");
  });
});
