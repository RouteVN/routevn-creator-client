import { describe, expect, it } from "vitest";
import { validatePlatformDetails } from "../../src/internal/platformDetailsValidation.js";

describe("platform details validation", () => {
  it("requires an application name for every platform", () => {
    expect(
      validatePlatformDetails({
        platform: "web",
        applicationInfo: { applicationName: "   " },
      }),
    ).toEqual({ valid: false, code: "application-name-required" });
  });

  it("rejects Web colors that no longer exist", () => {
    expect(
      validatePlatformDetails({
        platform: "web",
        applicationInfo: {
          applicationName: "Project One",
          themeColorId: "color-missing",
          backgroundColorId: "",
        },
        availableColorIds: new Set(["color-theme"]),
      }),
    ).toEqual({ valid: false, code: "theme-color-not-found" });
  });

  it("allows an empty Windows identifier and validates one when provided", () => {
    expect(
      validatePlatformDetails({
        platform: "windows",
        applicationInfo: {
          applicationName: "Project One",
          iconFileId: "windows-icon",
          applicationIdentifier: "",
        },
      }),
    ).toEqual({ valid: true });
    expect(
      validatePlatformDetails({
        platform: "windows",
        applicationInfo: {
          applicationName: "Project One",
          iconFileId: "windows-icon",
          applicationIdentifier: "Project One",
        },
      }),
    ).toEqual({ valid: false, code: "windows-identifier-invalid" });
  });

  it("requires icons for native platforms but keeps the Web icon optional", () => {
    expect(
      validatePlatformDetails({
        platform: "windows",
        applicationInfo: {
          applicationName: "Project One",
          applicationIdentifier: "",
        },
      }),
    ).toEqual({ valid: false, code: "native-icon-required" });
    expect(
      validatePlatformDetails({
        platform: "macos",
        applicationInfo: {
          applicationName: "Project One",
          applicationIdentifier: "com.example.game",
          category: "",
        },
      }),
    ).toEqual({ valid: false, code: "native-icon-required" });
    expect(
      validatePlatformDetails({
        platform: "web",
        applicationInfo: { applicationName: "Project One" },
      }),
    ).toEqual({ valid: true });
  });

  it("requires a valid macOS identifier and validates an optional category", () => {
    expect(
      validatePlatformDetails({
        platform: "macos",
        applicationInfo: {
          applicationName: "Project One",
          iconFileId: "mac-icon",
          applicationIdentifier: "",
          category: "",
        },
      }),
    ).toEqual({ valid: false, code: "macos-identifier-required" });
    expect(
      validatePlatformDetails({
        platform: "macos",
        applicationInfo: {
          applicationName: "Project One",
          iconFileId: "mac-icon",
          applicationIdentifier: "com.example.game",
          category: "games",
        },
      }),
    ).toEqual({ valid: false, code: "macos-category-invalid" });
    expect(
      validatePlatformDetails({
        platform: "macos",
        applicationInfo: {
          applicationName: "Project One",
          iconFileId: "mac-icon",
          applicationIdentifier: "com.example.game",
          category: "public.app-category.games",
        },
      }),
    ).toEqual({ valid: true });
  });
});
