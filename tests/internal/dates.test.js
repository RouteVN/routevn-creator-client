import { describe, expect, it } from "vitest";
import {
  formatCalendarDate,
  formatDate,
  formatDateTimeWithSeconds,
  formatDimensions,
  formatDurationLabel,
  formatElapsedSeconds,
  formatList,
  formatMilliseconds,
  formatNumber,
  formatNumberWithUnit,
  formatPercent,
} from "../../src/internal/dates.js";
import {
  EN_I18N,
  FR_I18N,
  ID_I18N,
  IT_I18N,
  KO_I18N,
  PL_I18N,
  PT_I18N,
  RU_I18N,
  ZH_HANS_I18N,
  ZH_HANT_I18N,
} from "../support/i18n.js";

const minutesAgo = (minutes) =>
  new Date(Date.now() - minutes * 60 * 1000).toISOString();

describe("formatCalendarDate", () => {
  it("shows the UTC day without the time in the catalog locale", () => {
    expect(formatCalendarDate(1786492800000)).toBe("Aug 12, 2026");
    expect(formatCalendarDate(1786492800000 + 23 * 3600 * 1000)).toBe(
      "Aug 12, 2026",
    );
    expect(formatCalendarDate(1786492800000, FR_I18N.dateTime)).toBe(
      "12 août 2026",
    );
  });

  it("writes the month as a number when the catalog asks for it", () => {
    expect(formatCalendarDate(1786492800000, PL_I18N.dateTime)).toBe(
      "12.08.2026",
    );
  });
});

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

  it("formats relative times in the catalog's relative time style", () => {
    const { dateTime } = ID_I18N;

    expect(formatDate(minutesAgo(5), dateTime)).toBe("5 menit yang lalu");
    expect(formatDate(minutesAgo(2 * 60 + 5), dateTime)).toBe(
      "2 jam yang lalu",
    );
    expect(formatDate(minutesAgo(2 * 24 * 60 + 5), dateTime)).toBe(
      "Kemarin dulu",
    );
    expect(formatDate(minutesAgo(3 * 24 * 60 + 5), dateTime)).toBe(
      "3 hari yang lalu",
    );
    // Without a style, the short one abbreviates "hari" to "h".
    expect(formatDate(minutesAgo(3 * 24 * 60 + 5), { intlLocale: "id" })).toBe(
      "3 h lalu",
    );
    expect(formatDate(minutesAgo(3 * 24 * 60 + 5), IT_I18N.dateTime)).toBe(
      "3 giorni fa",
    );
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
    // Polish writes numeric dates, because CLDR's short month names lack the
    // period that Polish abbreviations take.
    expect(formatDate(value, PL_I18N.dateTime)).toMatch(
      /^15\.01\.2026, \d{2}:\d{2}$/,
    );
  });

  it("writes the hour the way the catalog asks", () => {
    const value = "2026-01-15T10:30:00.000Z";

    expect(formatDate(value, EN_I18N.dateTime)).toMatch(/\b\d{2}:\d{2} [AP]M$/);
    // Traditional Chinese clocks do not pad the hour, as in "下午2:05".
    expect(formatDate(value, ZH_HANT_I18N.dateTime)).toMatch(
      /^2026年1月15日 (上午|下午)[1-9]\d?:\d{2}$/,
    );
    // Korean clocks do not pad the hour either, as in "오후 2:05".
    expect(formatDate(value, KO_I18N.dateTime)).toMatch(
      /^2026년 1월 15일 (오전|오후) [1-9]\d?:\d{2}$/,
    );
  });
});

describe("formatDateTimeWithSeconds", () => {
  it("writes the month the way the catalog asks", () => {
    const value = "2026-10-18T09:05:07.000Z";

    expect(formatDateTimeWithSeconds(value, EN_I18N.dateTime)).toMatch(/Oct/);
    expect(formatDateTimeWithSeconds(value, PL_I18N.dateTime)).toMatch(
      /^\d{2}\.10\.2026, \d{2}:05:07$/,
    );
  });

  it("pads the day only when the month is a number", () => {
    // Local time, so the day is the 5th in any time zone.
    const value = new Date(2026, 9, 5, 9, 5, 7).toISOString();

    expect(formatDateTimeWithSeconds(value, EN_I18N.dateTime)).toBe(
      "Oct 5, 2026, 09:05:07",
    );
    expect(formatDateTimeWithSeconds(value, KO_I18N.dateTime)).toBe(
      "2026년 10월 5일 09:05:07",
    );
    expect(formatDateTimeWithSeconds(value, PL_I18N.dateTime)).toBe(
      "05.10.2026, 09:05:07",
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

describe("formatPercent", () => {
  it("joins the number and the sign in English", () => {
    expect(formatPercent(42)).toBe("42%");
    expect(formatPercent(42, EN_I18N.dateTime)).toBe("42%");
    expect(formatPercent(1000, EN_I18N.dateTime)).toBe("1000%");
    expect(formatPercent(112.35, EN_I18N.dateTime)).toBe("112.35%");
  });

  it("takes the number format and the sign from the dateTime catalog", () => {
    expect(formatPercent(42, FR_I18N.dateTime)).toBe("42\u00a0%");
    expect(formatPercent(112.35, FR_I18N.dateTime)).toBe("112,35\u00a0%");
    expect(formatPercent(1000, FR_I18N.dateTime)).toBe("1000\u00a0%");
    expect(formatPercent(42, RU_I18N.dateTime)).toBe("42\u00a0%");
    expect(formatPercent(12.5, PT_I18N.dateTime)).toBe("12,5%");
  });
});

describe("number formatting", () => {
  it("writes a number as String does in English", () => {
    for (const value of [0, 1.5, 0.25, -180, 1920, 9007199254740991]) {
      expect(formatNumber(value)).toBe(String(value));
      expect(formatNumber(value, EN_I18N.dateTime)).toBe(String(value));
    }
    expect(formatNumber(0.1 + 0.2)).toBe("0.30000000000000004");
    expect(formatNumber(-0)).toBe("0");
    expect(formatNumber(undefined)).toBe("");
    expect(formatNumber("")).toBe("");
  });

  it("uses the catalog locale's decimal separator without grouping", () => {
    expect(formatNumber(1.5, FR_I18N.dateTime)).toBe("1,5");
    expect(formatNumber(12500, FR_I18N.dateTime)).toBe("12500");
    expect(formatNumber(-0.25, PT_I18N.dateTime)).toBe("-0,25");
  });

  it("takes units from the dateTime catalog", () => {
    expect(formatNumberWithUnit(12, "pixels")).toBe("12 px");
    expect(formatNumberWithUnit(1.5, "seconds", EN_I18N.dateTime)).toBe(
      "1.5 s",
    );
    expect(formatNumberWithUnit(-45, "degrees", EN_I18N.dateTime)).toBe("-45°");
    expect(formatNumberWithUnit(1.5, "seconds", FR_I18N.dateTime)).toBe(
      "1,5\u00a0s",
    );
    expect(formatNumberWithUnit(0.5, "pixels", RU_I18N.dateTime)).toBe(
      "0,5\u00a0px",
    );
    expect(formatNumberWithUnit(45, "degrees", FR_I18N.dateTime)).toBe("45°");
  });

  it("writes dimensions from the dateTime catalog", () => {
    expect(formatDimensions(1920, 1080)).toBe("1920 × 1080");
    expect(formatDimensions(1920, 1080, EN_I18N.dateTime)).toBe("1920 × 1080");
    expect(formatDimensions(1920, 1080, FR_I18N.dateTime)).toBe(
      "1920\u00a0×\u00a01080",
    );
  });
});

describe("formatList", () => {
  it("joins items with the catalog's separator and no final and", () => {
    const items = ["Alpha", "Beta", "3 more"];

    expect(formatList(items)).toBe("Alpha, Beta, 3 more");
    expect(formatList(items, EN_I18N.dateTime)).toBe("Alpha, Beta, 3 more");
    expect(formatList(items, KO_I18N.dateTime)).toBe("Alpha, Beta, 3 more");
    expect(formatList(items, ZH_HANS_I18N.dateTime)).toBe(
      "Alpha、Beta、3 more",
    );
    expect(formatList(items, ZH_HANT_I18N.dateTime)).toBe(
      "Alpha、Beta、3 more",
    );
    expect(formatList(["Alpha"], ZH_HANS_I18N.dateTime)).toBe("Alpha");
  });
});
