import { describe, expect, it } from "vitest";
import { createPlatformEditForm } from "../../src/internal/ui/platformDetailsForm.js";
import { EN_I18N } from "../support/i18n.js";

const COPY = EN_I18N.platformDetailsPage;

describe("platform details form hints", () => {
  it.each(["web", "windows", "macos", "android", "ios"])(
    "names every %s field that has a hint, so the form can show it",
    (platform) => {
      const { fields } = createPlatformEditForm(platform, "create", COPY);
      const hinted = fields.filter((field) => field.tooltip);

      expect(hinted.length).toBeGreaterThan(0);
      for (const field of hinted) {
        expect(field.name).toBeTruthy();
        expect(field.tooltip.content).toBeTruthy();
        expect(field.description).toBeUndefined();
      }
    },
  );
});
