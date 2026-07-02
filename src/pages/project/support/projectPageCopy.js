export const selectProjectPageCopy = (i18n = {}) => {
  if (!i18n.projectPage) {
    throw new Error("projectPage i18n catalog is required.");
  }

  return i18n.projectPage;
};

export const formatProjectPageCopy = (template, replacements = {}) => {
  let text = template;
  Object.entries(replacements).forEach(([key, value]) => {
    text = text.replaceAll(`{${key}}`, value ?? "");
  });
  return text;
};
