import { describe, expect, it } from "vitest";
import { formatI18nCopy } from "../../src/internal/ui/i18nCopy.js";

describe("formatI18nCopy", () => {
  it("inserts values that contain replacement patterns as written", () => {
    expect(formatI18nCopy("Delete {name}?", { name: "Price $& tax $'" })).toBe(
      "Delete Price $& tax $'?",
    );
  });
});
