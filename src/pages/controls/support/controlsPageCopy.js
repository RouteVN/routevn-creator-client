import { selectI18nCopy } from "../../../internal/ui/i18nCopy.js";

export const selectControlsPageCopy = (i18n = {}) => {
  return selectI18nCopy(i18n, ["resourcePages", "controlsPage"]);
};
