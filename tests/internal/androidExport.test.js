import { describe, expect, it } from "vitest";
import {
  createAndroidApkFileName,
  getAndroidExportOrientation,
  isAndroidExportSpaceError,
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
  });
  it.each([
    [1920, 1080, "landscape"],
    [1080, 1920, "portrait"],
    [512, 512, "landscape"],
  ])("derives orientation from %s × %s", (width, height, orientation) => {
    expect(getAndroidExportOrientation({ width, height })).toBe(orientation);
  });
  it("refuses a missing project resolution", () => {
    expect(() => getAndroidExportOrientation()).toThrow("Project resolution");
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

describe("Android export space failures", () => {
  it.each([
    [
      "the exporter's free-space check",
      {
        code: "not-enough-space",
        message: "Not enough free space to export: about 2.3 GB is needed.",
      },
    ],
    [
      "a desktop write on a full disk",
      {
        code: "write-failed",
        message:
          "Failed to write the APK: No space left on device (os error 28)",
      },
    ],
    [
      "an Android copy to a full location",
      Object.assign(
        new Error("write failed: ENOSPC (No space left on device)"),
        {
          code: "IllegalStateException",
        },
      ),
    ],
    [
      "an iOS write refused for lack of space",
      Object.assign(new Error("The file couldn’t be saved."), {
        code: "storageFull",
      }),
    ],
  ])("recognizes %s", (_label, error) => {
    expect(isAndroidExportSpaceError(error)).toBe(true);
  });

  it("does not treat other failures as a lack of space", () => {
    expect(
      isAndroidExportSpaceError({
        code: "template-missing",
        message: "The Android player template is not installed.",
      }),
    ).toBe(false);
    expect(isAndroidExportSpaceError(new Error("Failure One"))).toBe(false);
    expect(isAndroidExportSpaceError(undefined)).toBe(false);
  });
});
