import { describe, expect, it } from "vitest";
import {
  createIosIpaFileName,
  isValidIosBuildNumber,
  isValidIosBundleIdentifier,
  isValidIosTeamId,
  isValidIosVersion,
  pickIosTeamId,
} from "../../src/internal/iosExport.js";

describe("iOS export helpers", () => {
  it("accepts the versions and build numbers Xcode accepts", () => {
    expect(isValidIosVersion("1.2.3")).toBe(true);
    expect(isValidIosVersion("0.0.0")).toBe(true);
    expect(isValidIosVersion("1.2")).toBe(false);
    expect(isValidIosVersion("1.02.3")).toBe(false);
    expect(isValidIosVersion("1234567890.0.0")).toBe(false);
    expect(isValidIosBuildNumber("1")).toBe(true);
    expect(isValidIosBuildNumber("999999999")).toBe(true);
    expect(isValidIosBuildNumber("0")).toBe(false);
    expect(isValidIosBuildNumber("01")).toBe(false);
    expect(isValidIosBuildNumber("1234567890")).toBe(false);
  });

  it("checks bundle identifiers and team IDs", () => {
    expect(isValidIosBundleIdentifier("com.example.project-one")).toBe(true);
    expect(isValidIosBundleIdentifier("com.example.project_one")).toBe(false);
    expect(isValidIosBundleIdentifier("game")).toBe(false);
    expect(isValidIosBundleIdentifier(`com.${"a".repeat(160)}`)).toBe(false);
    expect(isValidIosTeamId("ABCDE12345")).toBe(true);
    expect(isValidIosTeamId("abcde12345")).toBe(false);
    expect(isValidIosTeamId("ABCDE1234")).toBe(false);
  });

  it("names the IPA", () => {
    expect(createIosIpaFileName("Project: One", "1.2.3")).toBe(
      "Project- One-1.2.3.ipa",
    );
  });

  it("selects the remembered team, else the first paid one", () => {
    const teams = [
      { id: "PERSONAL12", free: true },
      { id: "COMPANY123", free: false },
    ];
    expect(pickIosTeamId(teams, "PERSONAL12")).toBe("PERSONAL12");
    expect(pickIosTeamId(teams, "GONE123456")).toBe("COMPANY123");
    expect(pickIosTeamId(teams, "")).toBe("COMPANY123");
    expect(pickIosTeamId([{ id: "PERSONAL12", free: true }])).toBe(
      "PERSONAL12",
    );
    expect(pickIosTeamId([])).toBeUndefined();
  });
});
