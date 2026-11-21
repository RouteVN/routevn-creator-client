export const WEB_SCREEN_FADE_DURATION_DEFAULT = 0;
export const WEB_SCREEN_FADE_DURATION_MAX = 2000;
export const WEB_SCREEN_FADE_DURATION_STEP = 100;

// The fade lengths a creator can pick, in milliseconds.
export const WEB_SCREEN_FADE_DURATIONS = Array.from(
  { length: WEB_SCREEN_FADE_DURATION_MAX / WEB_SCREEN_FADE_DURATION_STEP + 1 },
  (_, index) => index * WEB_SCREEN_FADE_DURATION_STEP,
);

// A fade duration as one of the lengths a creator can pick. Anything that is
// not a number, including an empty form field, falls back to the default; a
// number is moved into range and to the nearest step.
export const normalizeWebScreenFadeDuration = (value) => {
  if (value === undefined || value === null || value === "") {
    return WEB_SCREEN_FADE_DURATION_DEFAULT;
  }
  const duration = Number(value);
  if (!Number.isFinite(duration)) {
    return WEB_SCREEN_FADE_DURATION_DEFAULT;
  }
  const stepped =
    Math.round(duration / WEB_SCREEN_FADE_DURATION_STEP) *
    WEB_SCREEN_FADE_DURATION_STEP;
  return Math.min(Math.max(stepped, 0), WEB_SCREEN_FADE_DURATION_MAX);
};
