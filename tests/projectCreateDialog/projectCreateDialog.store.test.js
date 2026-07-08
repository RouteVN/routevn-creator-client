import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
} from "../../src/components/projectCreateDialog/projectCreateDialog.store.js";
import { EN_I18N } from "../support/i18n.js";

describe("projectCreateDialog.store", () => {
  it("does not expose portrait resolution in the create project form", () => {
    const state = createInitialState();
    const viewData = selectViewData({ state, i18n: EN_I18N });
    const resolutionField = viewData.form.fields.find(
      (field) => field.name === "resolution",
    );

    expect(resolutionField.options).toContainEqual({
      value: "1920x1080",
      label: "1920x1080",
    });
    expect(resolutionField.options).not.toContainEqual({
      value: "1080x1920",
      label: "1080x1920",
    });
  });
});
