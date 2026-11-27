// The template a new project starts from: the one bundled with the app, one
// from the asset store, or a template file on this device. A store template
// carries what the Create Project form shows of it: its title, cover and
// resolution, the one resolution it is made for. A template file carries its
// title and resolution, and the file itself.

export const BUNDLED_PROJECT_TEMPLATE_ID = "default";

export const PROJECT_TEMPLATE_SOURCE_BUNDLED = "bundled";
export const PROJECT_TEMPLATE_SOURCE_STORE = "store";
export const PROJECT_TEMPLATE_SOURCE_FILE = "file";

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

// A template file has no ID of its own; it is the only one the form holds.
export const createFileProjectTemplate = ({ file, title, resolution }) => ({
  id: PROJECT_TEMPLATE_SOURCE_FILE,
  source: PROJECT_TEMPLATE_SOURCE_FILE,
  title,
  resolution,
  file,
});

export const isFileProjectTemplate = (template) =>
  template.source === PROJECT_TEMPLATE_SOURCE_FILE;

export const isBundledProjectTemplate = (template) =>
  template.source === PROJECT_TEMPLATE_SOURCE_BUNDLED;

// A picture of the bundled template's title screen, served beside the
// template itself.
export const BUNDLED_PROJECT_TEMPLATE_COVER_URL =
  "/templates/default/cover.webp";

// The picture shown for a template: the bundled template's title screen, or a
// store template's cover. A template file has none.
export const getProjectTemplateCoverUrl = (template) =>
  isBundledProjectTemplate(template)
    ? BUNDLED_PROJECT_TEMPLATE_COVER_URL
    : template.coverUrl;
