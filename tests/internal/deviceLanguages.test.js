import { describe, expect, it } from "vitest";
import { getDeviceLanguages } from "../../src/deps/clients/deviceLanguages.js";

describe("getDeviceLanguages", () => {
  it("returns the web view's languages, most preferred first", () => {
    expect(getDeviceLanguages({ languages: ["ja-JP", "en-US"] })).toEqual([
      "ja-JP",
      "en-US",
    ]);
  });

  it("falls back to the single language a web view reports", () => {
    expect(getDeviceLanguages({ languages: [], language: "fr-FR" })).toEqual([
      "fr-FR",
    ]);
    expect(getDeviceLanguages({})).toEqual([]);
  });
});
