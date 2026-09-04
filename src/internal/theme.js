export const THEME_DARK = "dark";
export const THEME_LIGHT = "light";
export const THEME_SOFT_DARK = "soft-dark";
export const THEME_NEUTRAL_LIGHT = "neutral-light";
const LEGACY_LIGHT_THEME_IDS = new Set(["light-soft", "light-warm"]);
const DARK_THEME_IDS = new Set([THEME_DARK, THEME_SOFT_DARK]);

export const APP_THEME_IDS = Object.freeze([
  THEME_DARK,
  THEME_LIGHT,
  THEME_SOFT_DARK,
  THEME_NEUTRAL_LIGHT,
]);

export const APP_THEME_CLASS_NAMES = Object.freeze(
  APP_THEME_IDS.map((theme) => `theme-${theme}`),
);

export const normalizeTheme = (theme) => {
  if (LEGACY_LIGHT_THEME_IDS.has(theme)) {
    return THEME_LIGHT;
  }

  return APP_THEME_IDS.includes(theme) ? theme : THEME_DARK;
};

export const isDarkTheme = (theme) => {
  return DARK_THEME_IDS.has(normalizeTheme(theme));
};

export const getThemeClassName = (theme) => {
  return `theme-${normalizeTheme(theme)}`;
};
