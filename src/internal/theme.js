export const THEME_DARK = "dark";
export const THEME_BLACK = "black";
export const THEME_LIGHT = "light";
export const DEFAULT_APP_THEME = THEME_DARK;
const LEGACY_DARK_THEME_IDS = new Set(["soft-dark"]);
const LEGACY_LIGHT_THEME_IDS = new Set(["light-soft", "light-warm"]);
const DARK_THEME_IDS = new Set([THEME_BLACK, THEME_DARK]);

export const APP_THEME_IDS = Object.freeze([
  THEME_DARK,
  THEME_BLACK,
  THEME_LIGHT,
]);

export const APP_THEME_CLASS_NAMES = Object.freeze(
  APP_THEME_IDS.map((theme) => `theme-${theme}`),
);

export const normalizeTheme = (theme) => {
  if (LEGACY_DARK_THEME_IDS.has(theme)) {
    return THEME_DARK;
  }

  if (LEGACY_LIGHT_THEME_IDS.has(theme)) {
    return THEME_LIGHT;
  }

  return APP_THEME_IDS.includes(theme) ? theme : DEFAULT_APP_THEME;
};

export const isDarkTheme = (theme) => {
  return DARK_THEME_IDS.has(normalizeTheme(theme));
};

export const getThemeClassName = (theme) => {
  return `theme-${normalizeTheme(theme)}`;
};
