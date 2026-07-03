import { normalizeTheme } from "../../internal/theme.js";
import { selectAppearancePageCopy } from "./support/appearancePageCopy.js";

const themeOptions = [
  {
    id: "dark",
    name: "Dark",
    copyKey: "darkThemeName",
    previewPageBackground: "oklch(0.145 0 0)",
    previewPanelBackground: "oklch(0.18 0 0)",
    previewCardBackground: "oklch(0.269 0 0)",
    previewAccent: "oklch(0.371 0 0)",
    previewBorder: "oklch(1 0 0 / 10%)",
  },
  {
    id: "light",
    name: "Light",
    copyKey: "lightThemeName",
    previewPageBackground: "oklch(0.975 0.004 250)",
    previewPanelBackground: "oklch(0.992 0.002 250)",
    previewCardBackground: "oklch(0.94 0.006 250)",
    previewAccent: "oklch(0.9 0.015 250)",
    previewBorder: "oklch(0.84 0.012 250)",
  },
];

export const createInitialState = () => ({
  resourceCategory: "settings",
  selectedResourceId: "appearance",
  repositoryTarget: "settings",
  flatItems: [],
  currentTheme: "dark",
  isTouchMode: false,
});

export const setCurrentTheme = ({ state }, { theme } = {}) => {
  state.currentTheme = normalizeTheme(theme);
};

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode =
    uiConfig?.id === "touch" || uiConfig?.inputMode === "touch";
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectAppearancePageCopy(i18n);
  const themes = themeOptions.map((item) => {
    const isSelected = state.currentTheme === item.id;

    return {
      ...item,
      name: copy[item.copyKey] ?? item.name,
      isSelected,
      itemBorderColor: isSelected ? "pr" : "bo",
      itemHoverBorderColor: isSelected ? "pr" : "ac",
    };
  });

  return {
    ...state,
    themes,
    showExplorerPanel: !state.isTouchMode,
    contentPadding: state.isTouchMode ? "0" : "lg",
    contentBodyPadding: state.isTouchMode ? "lg" : "0",
    contentBodyMarginTop: state.isTouchMode ? "0" : "lg",
    title: copy.title ?? "Appearance",
    themesTitle: copy.themesTitle ?? "Themes",
  };
};

export const selectState = ({ state }) => {
  return state;
};
