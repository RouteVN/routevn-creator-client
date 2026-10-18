const capitalizeFirst = (text, intlLocale) =>
  text.charAt(0).toLocaleUpperCase(intlLocale) + text.slice(1);

/**
 * Format ISO date string to human-readable format
 * @param {string} isoDateString - ISO date string like "2025-10-20T04:23:52.636Z"
 * @param {Object} [options] - The `dateTime` catalog of the active locale
 * @param {string} [options.intlLocale] - BCP 47 tag used for Intl formatting
 * @param {string} [options.justNow] - Label for dates less than a minute old
 * @returns {string} Formatted date string
 */
export const formatDate = (
  isoDateString,
  { intlLocale = "en-US", justNow = "Just now" } = {},
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
      style: "short",
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
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  return date.toLocaleDateString(intlLocale, options);
};

/**
 * Format a timestamp as a date and time with seconds, in 24-hour time.
 * @param {string} value - ISO date string
 * @param {Object} [options] - The `dateTime` catalog of the active locale
 * @param {string} [options.intlLocale] - BCP 47 tag used for Intl formatting
 * @returns {string} Formatted date and time
 */
export const formatDateTimeWithSeconds = (
  value,
  { intlLocale = "en-US" } = {},
) =>
  new Intl.DateTimeFormat(intlLocale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
