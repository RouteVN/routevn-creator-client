import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("settings language view", () => {
  it("uses a standalone selector that applies changes directly", () => {
    const languageView = readFileSync(
      new URL("../../src/pages/language/language.view.yaml", import.meta.url),
      "utf8",
    );

    expect(languageView).toContain("rtgl-select#languageSelect");
    expect(languageView).toContain("value-change:");
    expect(languageView).toContain("handler: handleLanguageChange");
    expect(languageView).not.toContain("rtgl-form");
    expect(languageView).not.toContain("save-language");
    expect(languageView).not.toContain("languageLabel");
  });
});
