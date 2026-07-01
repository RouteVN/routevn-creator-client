import { selectI18nCopy } from "../../../internal/ui/i18nCopy.js";

export const selectAboutPageCopy = (i18n = {}) => {
  return selectI18nCopy(i18n, ["aboutPage"]);
};
