const capitalizeFirst = (text, intlLocale) =>
  text.charAt(0).toLocaleUpperCase(intlLocale) + text.slice(1);

/**
 * Format ISO date string to human-readable format
 * @param {string} isoDateString - ISO date string like "2025-10-20T04:23:52.636Z"
 * @param {Object} [options] - The `dateTime` catalog of the active locale
 * @param {string} [options.intlLocale] - BCP 47 tag used for Intl formatting
 * @param {"long"|"short"|"narrow"} [options.relativeTimeStyle] - Style of
 *   relative times, such as "5 min. ago" for short or "5 minutes ago" for long
 * @param {"short"|"2-digit"} [options.monthStyle] - How older dates show the
 *   month, such as "Oct 18, 2026" for short or "18.10.2026" in Polish for 2-digit
 * @param {"2-digit"|"numeric"} [options.hourStyle] - How older dates show the
 *   hour, such as "02:05 PM" for 2-digit or "下午2:05" in Traditional Chinese
 *   for numeric
 * @param {string} [options.justNow] - Label for dates less than a minute old
 * @returns {string} Formatted date string
 */
export const formatDate = (
  isoDateString,
  {
    intlLocale = "en-US",
    relativeTimeStyle = "short",
    monthStyle = "short",
    hourStyle = "2-digit",
    justNow = "Just now",
  } = {},
) => {
  if (!isoDateString) return "";

  const date = new Date(isoDateString);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // For recent dates (within 7 days), show relative format
  if (diffDays < 7) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    if (diffDays === 0 && diffHours === 0 && diffMinutes === 0) {
      return justNow;
    }

    const relativeTime = new Intl.RelativeTimeFormat(intlLocale, {
      numeric: "auto",
      style: relativeTimeStyle,
    });
    let text;
    if (diffDays !== 0) {
      text = relativeTime.format(-diffDays, "day");
    } else if (diffHours !== 0) {
      text = relativeTime.format(-diffHours, "hour");
    } else {
      text = relativeTime.format(-diffMinutes, "minute");
    }
    return capitalizeFirst(text, intlLocale);
  }

  // For older dates, show readable date format
  const options = {
    year: "numeric",
    month: monthStyle,
    day: "numeric",
    hour: hourStyle,
    minute: "2-digit",
  };
  return date.toLocaleDateString(intlLocale, options);
};

/**
 * Format epoch milliseconds as a calendar date without the time. Store dates
 * such as a release day are stored as UTC midnight, so they are read in UTC to
 * show the same day in every time zone.
 * @param {number} epochMs - Milliseconds since the Unix epoch
 * @param {Object} [options] - The `dateTime` catalog of the active locale
 * @param {string} [options.intlLocale] - BCP 47 tag used for Intl formatting
 * @param {"short"|"2-digit"} [options.monthStyle] - How the month is shown
 * @returns {string} Formatted date, such as "Aug 12, 2026"
 */
export const formatCalendarDate = (
  epochMs,
  { intlLocale = "en-US", monthStyle = "short" } = {},
) =>
  new Date(epochMs).toLocaleDateString(intlLocale, {
    year: "numeric",
    month: monthStyle,
    day: "numeric",
    timeZone: "UTC",
  });

/**
 * Format a timestamp as a date and time with seconds, in 24-hour time.
 * The day is padded only when the month is a number, as in "05.10.2026";
 * next to a month name it is not, as in "Oct 5, 2026" or "2026년 10월 5일".
 * @param {string} value - ISO date string
 * @param {Object} [options] - The `dateTime` catalog of the active locale
 * @param {string} [options.intlLocale] - BCP 47 tag used for Intl formatting
 * @param {"short"|"2-digit"} [options.monthStyle] - How the month is shown
 * @returns {string} Formatted date and time
 */
export const formatDateTimeWithSeconds = (
  value,
  { intlLocale = "en-US", monthStyle = "short" } = {},
) =>
  new Intl.DateTimeFormat(intlLocale, {
    day: monthStyle === "2-digit" ? "2-digit" : "numeric",
    month: monthStyle,
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));

const formatUnitValue = (template, value, intlLocale) =>
  template.replaceAll("{value}", () =>
    new Intl.NumberFormat(intlLocale, {
      maximumFractionDigits: 2,
      useGrouping: false,
    }).format(value),
  );

/**
 * Format a number of milliseconds with the unit, such as "250ms".
 * @param {number} value - Duration in milliseconds
 * @param {Object} [options] - The `dateTime` catalog of the active locale
 * @param {string} [options.intlLocale] - BCP 47 tag used for number formatting
 * @param {string} [options.durationMilliseconds] - Template with `{value}`
 * @returns {string} Formatted duration
 */
export const formatMilliseconds = (
  value,
  { intlLocale = "en-US", durationMilliseconds = "{value}ms" } = {},
) => formatUnitValue(durationMilliseconds, Number(value) || 0, intlLocale);

/**
 * Format a percentage with the percent sign, such as "42%".
 * @param {number} value - Percentage, such as 42 for 42%
 * @param {Object} [options] - The `dateTime` catalog of the active locale
 * @param {string} [options.intlLocale] - BCP 47 tag used for number formatting
 * @param {string} [options.percent] - Template with `{value}`
 * @returns {string} Formatted percentage
 */
export const formatPercent = (
  value,
  { intlLocale = "en-US", percent = "{value}%" } = {},
) => formatUnitValue(percent, Number(value) || 0, intlLocale);

/**
 * Format a duration in milliseconds below one second, then in seconds with
 * one decimal below ten seconds and two from there, such as "1.5s".
 * @param {number} durationMs - Duration in milliseconds
 * @param {Object} [dateTime] - The `dateTime` catalog of the active locale
 * @returns {string} Formatted duration
 */
export const formatDurationLabel = (durationMs, dateTime = {}) => {
  const resolvedDurationMs = Number(durationMs) || 0;
  if (resolvedDurationMs < 1000) {
    return formatMilliseconds(resolvedDurationMs, dateTime);
  }

  const { intlLocale = "en-US", durationSeconds = "{value}s" } = dateTime;
  const seconds = resolvedDurationMs / 1000;
  const roundedSeconds = Number.isInteger(seconds)
    ? seconds
    : Number(seconds.toFixed(seconds < 10 ? 1 : 2));
  return formatUnitValue(durationSeconds, roundedSeconds, intlLocale);
};

/**
 * Format whole elapsed seconds, such as "12s" or "2m 5s".
 * @param {number} elapsedSeconds - Whole seconds
 * @param {Object} [options] - The `dateTime` catalog of the active locale
 * @param {string} [options.durationSeconds] - Template with `{value}`
 * @param {string} [options.durationMinutesSeconds] - Template with
 *   `{minutes}` and `{seconds}`
 * @returns {string} Formatted elapsed time
 */
export const formatElapsedSeconds = (
  elapsedSeconds,
  {
    durationSeconds = "{value}s",
    durationMinutesSeconds = "{minutes}m {seconds}s",
  } = {},
) => {
  if (elapsedSeconds < 60) {
    return durationSeconds.replaceAll("{value}", () => String(elapsedSeconds));
  }
  return durationMinutesSeconds
    .replaceAll("{minutes}", () => String(Math.floor(elapsedSeconds / 60)))
    .replaceAll("{seconds}", () => String(elapsedSeconds % 60));
};

// One formatter per locale, as the editors format many numbers a render.
const numberFormats = new Map();

/**
 * Format a number as `String` does, with every decimal it has, but with the
 * locale's decimal separator, such as "1.5", or "1,5" in French.
 * @param {number|string} value - The number
 * @param {Object} [options] - The `dateTime` catalog of the active locale
 * @param {string} [options.intlLocale] - BCP 47 tag used for number formatting
 * @returns {string} Formatted number, or an empty string for an unset value
 */
export const formatNumber = (value, { intlLocale = "en-US" } = {}) => {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  if (!numberFormats.has(intlLocale)) {
    numberFormats.set(
      intlLocale,
      new Intl.NumberFormat(intlLocale, {
        maximumFractionDigits: 20,
        useGrouping: false,
      }),
    );
  }
  // Intl writes -0 as "-0", where String writes "0".
  return numberFormats.get(intlLocale).format(value === 0 ? 0 : value);
};

/**
 * Join list items with the locale's separator, such as "A, B" or "A、B" in
 * Chinese and Japanese. App lists have no "and" before the last item, so one
 * can end with a count such as "3 more".
 * @param {string[]} items - The items, already in display order
 * @param {Object} [dateTime] - The `dateTime` catalog of the active locale
 * @param {string} [dateTime.listSeparator] - Text between two items
 * @returns {string} The joined list
 */
export const formatList = (items, { listSeparator = ", " } = {}) =>
  items.join(listSeparator);

// The English unit templates. Seconds keep the space here that the compact
// `durationSeconds` of timeline labels leaves out.
const UNIT_TEMPLATES = {
  pixels: "{value} px",
  seconds: "{value} s",
  degrees: "{value}°",
};

/**
 * Format a number with a unit, such as "12 px", "45°", or "1,5 s" in French.
 * @param {number|string} value - The number
 * @param {"pixels"|"seconds"|"degrees"} unit - The unit's template in the
 *   `dateTime` catalog
 * @param {Object} [dateTime] - The `dateTime` catalog of the active locale
 * @returns {string} Formatted number with its unit
 */
export const formatNumberWithUnit = (value, unit, dateTime = {}) =>
  (dateTime[unit] ?? UNIT_TEMPLATES[unit]).replaceAll("{value}", () =>
    formatNumber(value, dateTime),
  );

/**
 * Format a width and height, such as "1920 × 1080".
 * @param {number} width - Width
 * @param {number} height - Height
 * @param {Object} [dateTime] - The `dateTime` catalog of the active locale,
 *   with `intlLocale` for the numbers and the `dimensions` template
 * @returns {string} Formatted dimensions
 */
export const formatDimensions = (width, height, dateTime = {}) =>
  (dateTime.dimensions ?? "{width} × {height}")
    .replaceAll("{width}", () => formatNumber(width, dateTime))
    .replaceAll("{height}", () => formatNumber(height, dateTime));
