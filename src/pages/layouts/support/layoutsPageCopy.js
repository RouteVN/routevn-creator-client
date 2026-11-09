import { selectI18nCopy } from "../../../internal/ui/i18nCopy.js";

export const selectLayoutsPageCopy = (i18n = {}) => {
  return selectI18nCopy(i18n, ["resourcePages", "layoutsPage"]);
};

// The elements of a new Input layout are named as the layout editor names the
// elements its Add Element menu creates.
export const selectInputLayoutTemplateCopy = (i18n = {}) => {
  const layoutsCopy = selectI18nCopy(i18n, ["layoutsPage"]);
  const layoutEditorCopy = selectI18nCopy(i18n, ["layoutEditorPage"]);

  return {
    promptText: layoutsCopy.inputLayoutPromptText,
    submitText: layoutsCopy.inputLayoutSubmitText,
    textName: layoutEditorCopy.textMenuItem,
    inputName: layoutEditorCopy.inputMenuItem,
    submitContainerName: layoutEditorCopy.inputSubmitContainerMenuItem,
  };
};
