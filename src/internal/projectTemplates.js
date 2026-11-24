// The template a new project starts from: the one bundled with the app, or
// one from the asset store. A store template carries what the Create Project
// form shows of it: its title, cover and resolution, the one resolution it
// is made for.

export const BUNDLED_PROJECT_TEMPLATE_ID = "default";

export const PROJECT_TEMPLATE_SOURCE_BUNDLED = "bundled";
export const PROJECT_TEMPLATE_SOURCE_STORE = "store";

export const createBundledProjectTemplate = () => ({
  id: BUNDLED_PROJECT_TEMPLATE_ID,
  source: PROJECT_TEMPLATE_SOURCE_BUNDLED,
});

export const createStoreProjectTemplate = ({
  id,
  title,
  coverUrl,
  resolution,
}) => ({
  id,
  source: PROJECT_TEMPLATE_SOURCE_STORE,
  title,
  coverUrl,
  resolution,
});

export const isBundledProjectTemplate = (template) =>
  template.source === PROJECT_TEMPLATE_SOURCE_BUNDLED;

// A picture of the bundled template's title screen, served beside the
// template itself.
export const BUNDLED_PROJECT_TEMPLATE_COVER_URL =
  "/templates/default/cover.webp";

// The picture shown for a template: the bundled template's title screen, or a
// store template's cover.
export const getProjectTemplateCoverUrl = (template) =>
  isBundledProjectTemplate(template)
    ? BUNDLED_PROJECT_TEMPLATE_COVER_URL
    : template.coverUrl;
