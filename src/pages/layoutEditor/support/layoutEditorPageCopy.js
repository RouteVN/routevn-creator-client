import { selectI18nCopy } from "../../../internal/ui/i18nCopy.js";

export const selectLayoutEditorPageCopy = (i18n = {}) => {
  return selectI18nCopy(i18n, ["resourcePages", "layoutEditorPage"]);
};
