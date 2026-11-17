// App and project languages written right to left, by language subtag.
const RIGHT_TO_LEFT_LANGUAGES = new Set(["ar", "fa", "he", "ur"]);

// The writing direction of a BCP 47 tag, such as an app locale or project
// language: "rtl" or "ltr".
export const getTextDirection = (languageTag) => {
  const [language] = languageTag.toLowerCase().split("-");
  return RIGHT_TO_LEFT_LANGUAGES.has(language) ? "rtl" : "ltr";
};
