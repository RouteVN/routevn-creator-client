import { isBundledProjectTemplate } from "../projectTemplates.js";

export const selectProjectTemplateCopy = (i18n = {}) => {
  if (!i18n.projectTemplateDialog) {
    throw new Error("projectTemplateDialog i18n catalog is required.");
  }

  return i18n.projectTemplateDialog;
};

// The bundled template is named in the app's language; a store template
// keeps its own title.
export const selectProjectTemplateTitle = (i18n, template) =>
  isBundledProjectTemplate(template)
    ? selectProjectTemplateCopy(i18n).defaultTemplateTitle
    : template.title;
