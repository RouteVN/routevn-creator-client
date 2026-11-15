export const WEB_SCREEN_FADE_DURATION_DEFAULT = 600;
export const WEB_SCREEN_FADE_DURATION_MAX = 5000;

// A fade duration in whole milliseconds. Anything that is not a number in
// range, including an empty form field, falls back to the default.
export const normalizeWebScreenFadeDuration = (value) => {
  if (value === undefined || value === null || value === "") {
    return WEB_SCREEN_FADE_DURATION_DEFAULT;
  }
  const duration = Math.round(Number(value));
  if (!Number.isFinite(duration)) {
    return WEB_SCREEN_FADE_DURATION_DEFAULT;
  }
  return Math.min(Math.max(duration, 0), WEB_SCREEN_FADE_DURATION_MAX);
};
