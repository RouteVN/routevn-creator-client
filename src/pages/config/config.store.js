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
    previewPageBackground: "#1f1f1f",
    previewPanelBackground: "#282828",
    previewCardBackground: "#383838",
    previewAccent: "#4a4a4a",
    previewPrimary: "#dedede",
    previewSecondary: "#383838",
    previewInput: "rgba(255, 255, 255, 0.18)",
    previewBorder: "rgba(255, 255, 255, 0.14)",
  },
  {
    id: "black",
    name: "Black",
    copyKey: "blackThemeName",
    previewPageBackground: "#0a0a0a",
    previewPanelBackground: "#121212",
    previewCardBackground: "#262626",
    previewAccent: "#404040",
    previewPrimary: "#e5e5e5",
    previewSecondary: "#262626",
    previewInput: "rgba(255, 255, 255, 0.15)",
    previewBorder: "rgba(255, 255, 255, 0.1)",
  },
  {
    id: "light",
    name: "Light",
    copyKey: "lightThemeName",
    previewPageBackground: "#f5f7f9",
    previewPanelBackground: "#fbfcfe",
    previewCardBackground: "#e8ebef",
    previewAccent: "#d7dfe8",
    previewPrimary: "#2c343c",
    previewSecondary: "#eaedf1",
    previewInput: "#dde2e6",
    previewBorder: "#c5cbd2",
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
  showAndroidBackup: false,
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

export const setAndroidBackupVisible = ({ state }, { visible }) => {
  state.showAndroidBackup = visible;
};
