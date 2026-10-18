import { describe, expect, it } from "vitest";
import { formatDate } from "../../src/internal/dates.js";
import { RU_I18N } from "../support/i18n.js";

const minutesAgo = (minutes) =>
  new Date(Date.now() - minutes * 60 * 1000).toISOString();

describe("formatDate", () => {
  it("keeps the English labels by default", () => {
    expect(formatDate(minutesAgo(0))).toBe("Just now");
    expect(formatDate(minutesAgo(5))).toMatch(/^5 min/);
    expect(formatDate(minutesAgo(24 * 60 + 5))).toBe("Yesterday");
  });

  it("formats relative times in the catalog locale", () => {
    expect(formatDate(minutesAgo(0), RU_I18N.dateTime)).toBe("Только что");
    expect(formatDate(minutesAgo(5), RU_I18N.dateTime)).toMatch(
      /^5 мин.* назад$/,
    );
    expect(formatDate(minutesAgo(24 * 60 + 5), RU_I18N.dateTime)).toBe("Вчера");
  });

  it("formats older dates in the catalog locale", () => {
    const value = "2026-01-15T10:30:00.000Z";

    expect(formatDate(value, RU_I18N.dateTime)).toBe(
      new Date(value).toLocaleDateString("ru", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
  });
});
