import {
  APP_LOCALE_OPTIONS,
  DEFAULT_APP_LOCALE,
} from "../../internal/ui/appLocale.js";
import { selectSettingsLanguagePageCopy } from "./support/settingsLanguagePageCopy.js";

export const createInitialState = () => ({
  resourceCategory: "settings",
  selectedResourceId: "language",
  repositoryTarget: "settings",
  currentLocale: DEFAULT_APP_LOCALE,
  isTouchMode: false,
});

export const selectCurrentLocale = ({ state }) => {
  return state.currentLocale;
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectSettingsLanguagePageCopy(i18n);

  return {
    ...state,
    showExplorerPanel: !state.isTouchMode,
    contentPadding: state.isTouchMode ? "0" : "lg",
    contentBodyPadding: state.isTouchMode ? "md" : "0",
    contentBodyMarginTop: state.isTouchMode ? "0" : "lg",
    title: copy.title,
    description: copy.description,
    languageOptions: APP_LOCALE_OPTIONS,
  };
};

export const setCurrentLocale = ({ state }, { locale } = {}) => {
  state.currentLocale = locale ?? DEFAULT_APP_LOCALE;
};

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode =
    uiConfig?.id === "touch" || uiConfig?.inputMode === "touch";
};
