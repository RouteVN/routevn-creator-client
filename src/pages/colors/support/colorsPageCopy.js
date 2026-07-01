import { selectI18nCopy } from "../../../internal/ui/i18nCopy.js";

export const selectColorsPageCopy = (i18n = {}) => {
  return selectI18nCopy(i18n, ["resourcePages", "colorsPage"]);
};
