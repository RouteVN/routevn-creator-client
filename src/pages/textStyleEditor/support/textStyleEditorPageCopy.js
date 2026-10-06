import { selectI18nCopy } from "../../../internal/ui/i18nCopy.js";

// The editor shows the text style form's fields and the add color and add
// font dialogs, whose copy stays with the text styles page.
export const selectTextStyleEditorPageCopy = (i18n = {}) => {
  return selectI18nCopy(i18n, [
    "resourcePages",
    "textStylesPage",
    "textStyleEditorPage",
  ]);
};
