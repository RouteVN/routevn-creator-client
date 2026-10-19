import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDurationLabel,
  formatElapsedSeconds,
  formatMilliseconds,
} from "../../src/internal/dates.js";
import { FR_I18N, RU_I18N } from "../support/i18n.js";

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

describe("duration formatting", () => {
  it("formats milliseconds below one second and seconds from there", () => {
    expect(formatDurationLabel(250)).toBe("250ms");
    expect(formatDurationLabel(2000)).toBe("2s");
    expect(formatDurationLabel(1500)).toBe("1.5s");
    expect(formatDurationLabel(12500)).toBe("12.5s");
    expect(formatMilliseconds(1500)).toBe("1500ms");
    expect(formatElapsedSeconds(12)).toBe("12s");
    expect(formatElapsedSeconds(65)).toBe("1m 5s");
  });

  it("takes the number format and units from the dateTime catalog", () => {
    expect(formatDurationLabel(250, FR_I18N.dateTime)).toBe("250\u00a0ms");
    expect(formatDurationLabel(1500, FR_I18N.dateTime)).toBe("1,5\u00a0s");
    expect(formatElapsedSeconds(65, FR_I18N.dateTime)).toBe(
      "1\u00a0min 5\u00a0s",
    );
  });
});
