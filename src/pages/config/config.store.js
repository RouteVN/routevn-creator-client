import {
  APP_LOCALE_OPTIONS,
  DEFAULT_APP_LOCALE,
} from "../../internal/ui/appLocale.js";
import { DEFAULT_APP_THEME, normalizeTheme } from "../../internal/theme.js";
import { selectConfigPageCopy } from "./support/configPageCopy.js";

const themeOptions = [
  {
    id: "dark",
    name: "Dark",
    copyKey: "darkThemeName",
    previewPageBackground: "oklch(0.24 0 0)",
    previewPanelBackground: "oklch(0.2775 0 0)",
    previewCardBackground: "oklch(0.34 0 0)",
    previewAccent: "oklch(0.41 0 0)",
    previewPrimary: "oklch(0.9 0 0)",
    previewSecondary: "oklch(0.34 0 0)",
    previewInput: "oklch(1 0 0 / 18%)",
    previewBorder: "oklch(1 0 0 / 14%)",
  },
  {
    id: "black",
    name: "Black",
    copyKey: "blackThemeName",
    previewPageBackground: "oklch(0.145 0 0)",
    previewPanelBackground: "oklch(0.18 0 0)",
    previewCardBackground: "oklch(0.269 0 0)",
    previewAccent: "oklch(0.371 0 0)",
    previewPrimary: "oklch(0.922 0 0)",
    previewSecondary: "oklch(0.269 0 0)",
    previewInput: "oklch(1 0 0 / 15%)",
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
    previewPrimary: "oklch(0.32 0.018 250)",
    previewSecondary: "oklch(0.945 0.006 250)",
    previewInput: "oklch(0.91 0.008 250)",
    previewBorder: "oklch(0.84 0.012 250)",
  },
  {
    id: "catppuccin-mocha",
    name: "Catppuccin Mocha",
    copyKey: "catppuccinMochaThemeName",
    previewPageBackground: "#1e1e2e",
    previewPanelBackground: "#313244",
    previewCardBackground: "#313244",
    previewAccent: "#45475a",
    previewPrimary: "#89b4fa",
    previewSecondary: "#313244",
    previewInput: "#313244",
    previewBorder: "#45475a",
  },
];

export const createInitialState = () => ({
  resourceCategory: "settings",
  selectedResourceId: "config",
  repositoryTarget: "settings",
  currentTheme: DEFAULT_APP_THEME,
  currentLocale: DEFAULT_APP_LOCALE,
  assetPackageEnabled: false,
  showHelpButton: true,
  isTouchMode: false,
  showProjectFolder: false,
  projectFolderPath: undefined,
});

export const setProjectFolder = ({ state }, { visible, path }) => {
  state.showProjectFolder = visible;
  state.projectFolderPath = path;
};

export const setCurrentTheme = ({ state }, { theme } = {}) => {
  state.currentTheme = normalizeTheme(theme);
};

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode =
    uiConfig?.id === "touch" || uiConfig?.inputMode === "touch";
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectConfigPageCopy(i18n);
  const themeGridColumns = state.isTouchMode
    ? "4"
    : "repeat(auto-fill, minmax(min(320px, 100%), 320px))";
  const themes = themeOptions.map((item) => {
    const isSelected = state.currentTheme === item.id;

    return {
      ...item,
      name: copy[item.copyKey] ?? item.name,
      isSelected,
      itemBorderColor: isSelected ? "pr" : "bo",
      itemHoverBorderColor: isSelected ? "pr" : "ac",
      previewTiles: [],
    };
  });

  return {
    ...state,
    themes,
    showExplorerPanel: !state.isTouchMode,
    contentPadding: state.isTouchMode ? "0" : "lg",
    contentBodyPadding: state.isTouchMode ? "md" : "0",
    contentBodyMarginTop: state.isTouchMode ? "0" : "lg",
    themeGridColumns,
    themeGridSmallColumns: state.isTouchMode ? "2" : themeGridColumns,
    themePreviewAspectRatio: "16 / 9",
    title: copy.title,
    appearanceTitle: copy.appearanceTitle,
    languageTitle: copy.languageTitle,
    projectFolderTitle: copy.projectFolderTitle,
    changeProjectFolderLabel: copy.changeProjectFolderLabel,
    projectFolderPath: state.projectFolderPath ?? copy.projectFolderNotSet,
    assetPackageTitle: copy.assetPackageTitle,
    assetPackageDescription: copy.assetPackageDescription,
    helpButtonTitle: copy.helpButtonTitle,
    helpButtonDescription: copy.helpButtonDescription,
    helpButtonOptions: [
      { value: false, label: copy.hideLabel },
      { value: true, label: copy.showLabel },
    ],
    assetPackageOptions: [
      { value: false, label: copy.disabledLabel },
      { value: true, label: copy.enabledLabel },
    ],
    languageOptions: APP_LOCALE_OPTIONS,
  };
};

export const selectCurrentTheme = ({ state }) => state.currentTheme;

export const setAssetPackageEnabled = ({ state }, { enabled }) => {
  state.assetPackageEnabled = enabled;
};

export const selectCurrentLocale = ({ state }) => state.currentLocale;

export const setHelpButtonVisible = ({ state }, { visible }) => {
  state.showHelpButton = visible;
};

export const setCurrentLocale = ({ state }, { locale } = {}) => {
  state.currentLocale = locale ?? DEFAULT_APP_LOCALE;
};
