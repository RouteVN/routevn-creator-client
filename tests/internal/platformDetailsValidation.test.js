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

  it("requires a valid Windows identifier", () => {
    expect(
      validatePlatformDetails({
        platform: "windows",
        applicationInfo: {
          applicationName: "Project One",
          iconFileId: "windows-icon",
          applicationIdentifier: "",
        },
      }),
    ).toEqual({ valid: false, code: "windows-identifier-required" });
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
    expect(
      validatePlatformDetails({
        platform: "windows",
        applicationInfo: {
          applicationName: "Project One",
          iconFileId: "windows-icon",
          applicationIdentifier: "com.example.project-one",
        },
      }),
    ).toEqual({ valid: true });
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
    ).toEqual({ valid: false, code: "windows-icon-required" });
    expect(
      validatePlatformDetails({
        platform: "macos",
        applicationInfo: {
          applicationName: "Project One",
          applicationIdentifier: "com.example.game",
          category: "",
        },
      }),
    ).toEqual({ valid: false, code: "macos-icon-required" });
    expect(
      validatePlatformDetails({
        platform: "web",
        applicationInfo: {
          applicationName: "Project One",
          applicationIdentifier: "namespace-1",
        },
      }),
    ).toEqual({ valid: true });
  });

  it("requires a Web application identifier", () => {
    expect(
      validatePlatformDetails({
        platform: "web",
        applicationInfo: {
          applicationName: "Project One",
          applicationIdentifier: "",
        },
      }),
    ).toEqual({ valid: false, code: "web-identifier-required" });
  });

  it("allows only letters, numbers, hyphens, and periods in a Web identifier", () => {
    expect(
      validatePlatformDetails({
        platform: "web",
        applicationInfo: {
          applicationName: "Project One",
          applicationIdentifier: "com.yourteam.yourvn",
        },
      }),
    ).toEqual({ valid: true });
    expect(
      validatePlatformDetails({
        platform: "web",
        applicationInfo: {
          applicationName: "Project One",
          applicationIdentifier: "com.yourteam/yourvn",
        },
      }),
    ).toEqual({ valid: false, code: "web-identifier-invalid" });
  });

  it("requires a valid macOS identifier", () => {
    expect(
      validatePlatformDetails({
        platform: "macos",
        applicationInfo: {
          applicationName: "Project One",
          iconFileId: "mac-icon",
          applicationIdentifier: "",
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
        },
      }),
    ).toEqual({ valid: true });
  });
});
