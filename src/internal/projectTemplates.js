// The template a new project starts from: the one bundled with the app, or
// one from the asset store. A store template carries what the Create Project
// form shows of it: its title and cover.

export const BUNDLED_PROJECT_TEMPLATE_ID = "default";

export const PROJECT_TEMPLATE_SOURCE_BUNDLED = "bundled";
export const PROJECT_TEMPLATE_SOURCE_STORE = "store";

export const createBundledProjectTemplate = () => ({
  id: BUNDLED_PROJECT_TEMPLATE_ID,
  source: PROJECT_TEMPLATE_SOURCE_BUNDLED,
});

export const createStoreProjectTemplate = ({ id, title, coverUrl }) => ({
  id,
  source: PROJECT_TEMPLATE_SOURCE_STORE,
  title,
  coverUrl,
});

export const isBundledProjectTemplate = (template) =>
  template.source === PROJECT_TEMPLATE_SOURCE_BUNDLED;

// The bundled template a project is created from. Store templates are not
// downloaded yet, so a project made from one starts from the bundled template.
export const resolveProjectTemplateForCreation = (_template) =>
  BUNDLED_PROJECT_TEMPLATE_ID;
