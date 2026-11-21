// App and project languages written right to left, by language subtag.
const RIGHT_TO_LEFT_LANGUAGES = new Set(["ar", "fa", "he", "ur"]);

// The writing direction of a BCP 47 tag, such as an app locale or project
// language: "rtl" or "ltr".
export const getTextDirection = (languageTag) => {
  const [language] = languageTag.toLowerCase().split("-");
  return RIGHT_TO_LEFT_LANGUAGES.has(language) ? "rtl" : "ltr";
};

// Under a right-to-left document, Rettangoli mirrors a popover's `place`
// around its anchor point. A popover lined up with an element's inline start
// or end is anchored on that edge, which is the other physical side in RTL, so
// the RTL layout mirrors the LTR one. `direction` is "rtl" or "ltr".
export const getInlineStartX = (rect, direction) =>
  direction === "rtl" ? rect.right : rect.left;

export const getInlineEndX = (rect, direction) =>
  direction === "rtl" ? rect.left : rect.right;
