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
    text = text.replaceAll(`{${key}}`, () => value ?? "");
  });
  return text;
};

// A count message is a family of keys named after the CLDR plural categories,
// such as `actionCount_one` and `actionCount_other`. English needs `one` and
// `other`; Russian also needs `few` and `many` (1 строка, 2 строки, 5 строк).
// This picks the key for the count's category and falls back to `_other`.
// `pluralRulesLocale` comes from the `dateTime` catalog, which can name a
// different locale than `intlLocale`.
export const selectPluralCopy = (
  copy,
  key,
  count,
  { pluralRulesLocale = "en-US" } = {},
) => {
  const category = new Intl.PluralRules(pluralRulesLocale).select(count);
  return copy[`${key}_${category}`] ?? copy[`${key}_other`];
};

// Formats a count message. `replacements` defaults to `{ count }`; pass it
// when the message needs other values or a formatted number.
export const formatPluralCopy = (
  copy,
  key,
  count,
  { dateTime, replacements = { count } } = {},
) => formatI18nCopy(selectPluralCopy(copy, key, count, dateTime), replacements);
