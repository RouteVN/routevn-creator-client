import { selectI18nCopy } from "../../../internal/ui/i18nCopy.js";

// The editor shows the particle form's fields, whose copy stays with the
// particles page.
export const selectParticleEditorPageCopy = (i18n = {}) => {
  return selectI18nCopy(i18n, [
    "resourcePages",
    "particlesPage",
    "particleEditorPage",
  ]);
};
