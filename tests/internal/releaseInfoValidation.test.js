import { describe, expect, it } from "vitest";
import { validatePlatformReleaseInfo } from "../../src/internal/releaseInfoValidation.js";

describe("release info validation", () => {
  it("requires an application name for every platform", () => {
    expect(
      validatePlatformReleaseInfo({
        platform: "web",
        applicationInfo: { applicationName: "   " },
      }),
    ).toEqual({ valid: false, code: "application-name-required" });
  });

  it("rejects Web colors that no longer exist", () => {
    expect(
      validatePlatformReleaseInfo({
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
      validatePlatformReleaseInfo({
        platform: "windows",
        applicationInfo: {
          applicationName: "Project One",
          applicationIdentifier: "",
        },
      }),
    ).toEqual({ valid: true });
    expect(
      validatePlatformReleaseInfo({
        platform: "windows",
        applicationInfo: {
          applicationName: "Project One",
          applicationIdentifier: "Project One",
        },
      }),
    ).toEqual({ valid: false, code: "windows-identifier-invalid" });
  });

  it("requires a valid macOS identifier and validates an optional category", () => {
    expect(
      validatePlatformReleaseInfo({
        platform: "macos",
        applicationInfo: {
          applicationName: "Project One",
          applicationIdentifier: "",
          category: "",
        },
      }),
    ).toEqual({ valid: false, code: "macos-identifier-required" });
    expect(
      validatePlatformReleaseInfo({
        platform: "macos",
        applicationInfo: {
          applicationName: "Project One",
          applicationIdentifier: "com.example.game",
          category: "games",
        },
      }),
    ).toEqual({ valid: false, code: "macos-category-invalid" });
    expect(
      validatePlatformReleaseInfo({
        platform: "macos",
        applicationInfo: {
          applicationName: "Project One",
          applicationIdentifier: "com.example.game",
          category: "public.app-category.games",
        },
      }),
    ).toEqual({ valid: true });
  });
});
