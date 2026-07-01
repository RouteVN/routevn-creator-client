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
    previewPageBackground: "oklch(1 0 0)",
    previewPanelBackground: "oklch(0.99 0 0)",
    previewCardBackground: "oklch(0.97 0 0)",
    previewAccent: "oklch(0.95 0 0)",
    previewBorder: "oklch(0.922 0 0)",
  },
];

export const createInitialState = () => ({
  resourceCategory: "settings",
  selectedResourceId: "appearance",
  repositoryTarget: "settings",
  flatItems: [],
  currentTheme: "dark",
});

export const setCurrentTheme = ({ state }, { theme } = {}) => {
  state.currentTheme = theme === "light" ? "light" : "dark";
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
    title: copy.title ?? "Appearance",
    themesTitle: copy.themesTitle ?? "Themes",
  };
};

export const selectState = ({ state }) => {
  return state;
};
