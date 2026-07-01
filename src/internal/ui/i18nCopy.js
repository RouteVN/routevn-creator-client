export const selectI18nCopy = (i18n = {}, namespaces = []) => {
  const copy = {};

  namespaces.forEach((namespace) => {
    const namespaceCopy = i18n[namespace];
    if (!namespaceCopy) {
      throw new Error(`${namespace} i18n catalog is required.`);
    }

    Object.assign(copy, namespaceCopy);
  });

  return copy;
};

export const formatI18nCopy = (template, replacements = {}) => {
  let text = template;
  Object.entries(replacements).forEach(([key, value]) => {
    text = text.replaceAll(`{${key}}`, value ?? "");
  });
  return text;
};
