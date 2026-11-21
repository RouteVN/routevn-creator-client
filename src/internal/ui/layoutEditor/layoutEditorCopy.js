import { selectI18nCopy } from "../i18nCopy.js";

export const selectLayoutEditorPageCopy = (i18n = {}) => {
  return selectI18nCopy(i18n, ["resourcePages", "layoutEditorPage"]);
};
