import { selectI18nCopy } from "../../../internal/ui/i18nCopy.js";

export const selectLayoutEditPanelCopy = (i18n = {}) => {
  return selectI18nCopy(i18n, [
    "resourcePages",
    "controlsPage",
    "layoutEditPanel",
  ]);
};
