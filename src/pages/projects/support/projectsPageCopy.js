export const selectProjectsPageCopy = (i18n = {}) => {
  if (!i18n.projectsPage) {
    throw new Error("projectsPage i18n catalog is required.");
  }

  return i18n.projectsPage;
};

export const formatProjectsPageCopy = (template, replacements = {}) => {
  let text = template;
  Object.entries(replacements).forEach(([key, value]) => {
    text = text.replaceAll(`{${key}}`, value ?? "");
  });
  return text;
};
