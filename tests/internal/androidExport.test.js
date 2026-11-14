import { describe, expect, it } from "vitest";
import {
  createAndroidApkFileName,
  createAndroidBundleFileName,
  isValidAndroidBackgroundColor,
  normalizeAndroidBackgroundColor,
} from "../../src/internal/androidExport.js";
import { validatePlatformDetails } from "../../src/internal/platformDetailsValidation.js";
import {
  createPlatformDetailsPatch,
  getPlatformDetailsValidationMessage,
} from "../../src/internal/ui/platformDetailsForm.js";
import { EN_I18N } from "../support/i18n.js";

describe("Android export inputs", () => {
  it("reuses artifact filename sanitization with the entered version", () => {
    expect(createAndroidApkFileName("Project One", "1.2.3")).toBe(
      "Project One-1.2.3-unsigned.apk",
    );
    expect(createAndroidApkFileName("Project:/One?*", "1.2.3")).toBe(
      "Project--One---1.2.3-unsigned.apk",
    );
    expect(createAndroidBundleFileName("Project:/One?*", "1.2.3")).toBe(
      "Project--One---1.2.3.aab",
    );
  });
  it.each(["#ffffff", "#Ab123F", "#000000"])(
    "normalizes opaque color %s",
    (value) => {
      expect(isValidAndroidBackgroundColor(value)).toBe(true);
      expect(normalizeAndroidBackgroundColor(value)).toBe(value.toUpperCase());
    },
  );
  it.each([
    undefined,
    "",
    "red",
    "#FFF",
    "#12345678",
    "#12345G",
    " #123456",
    "#123456\n",
  ])("rejects color %s", (value) => {
    expect(isValidAndroidBackgroundColor(value)).toBe(false);
    expect(() => normalizeAndroidBackgroundColor(value)).toThrow("#RRGGBB");
  });
  const applicationInfo = {
    applicationName: "Project One",
    iconFileId: "icon-1",
    applicationIdentifier: "com.example.project_one",
    iconBackgroundColor: "#FFFFFF",
    splashBackgroundColor: "#000000",
  };
  it("normalizes form colors without hiding invalid values", () => {
    expect(
      createPlatformDetailsPatch({
        platform: "android",
        iconFileId: "icon-1",
        values: { ...applicationInfo, iconBackgroundColor: "#aabbcc" },
      }),
    ).toEqual({ ...applicationInfo, iconBackgroundColor: "#AABBCC" });
    const patch = createPlatformDetailsPatch({
      platform: "android",
      iconFileId: "icon-1",
      values: { ...applicationInfo, splashBackgroundColor: "#1234" },
    });
    expect(
      validatePlatformDetails({ platform: "android", applicationInfo: patch }),
    ).toEqual({ valid: false, code: "android-color-invalid" });
  });
  it.each([
    ["iconFileId", undefined, "android-icon-required", "androidIconRequired"],
    [
      "applicationIdentifier",
      "",
      "android-identifier-required",
      "androidApplicationIdentifierRequired",
    ],
    [
      "applicationIdentifier",
      "com.my-game",
      "android-identifier-invalid",
      "androidApplicationIdentifierInvalid",
    ],
    [
      "iconBackgroundColor",
      "#fff0",
      "android-color-invalid",
      "androidColorInvalid",
    ],
    [
      "splashBackgroundColor",
      "#fff0",
      "android-color-invalid",
      "androidColorInvalid",
    ],
  ])(
    "validates %s and provides localized feedback",
    (field, value, code, key) => {
      expect(
        validatePlatformDetails({
          platform: "android",
          applicationInfo: { ...applicationInfo, [field]: value },
        }),
      ).toEqual({ valid: false, code });
      expect(
        getPlatformDetailsValidationMessage(EN_I18N.platformDetailsPage, code),
      ).toBe(EN_I18N.platformDetailsPage[key]);
    },
  );
});
