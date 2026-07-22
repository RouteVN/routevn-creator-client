import { normalizeProjectLanguage } from "./projectLanguage.js";

export const DEFAULT_TEMPLATE_FONT_SETS = Object.freeze({
  // Combined Latin, Greek, Cyrillic, Vietnamese, and IPA coverage.
  latin: Object.freeze({
    400: Object.freeze(["7m7oC7i8JTEE"]),
    600: Object.freeze(["VWNPTSU9Rbn9"]),
  }),
  "zh-Hans": Object.freeze({
    400: Object.freeze(["Z2HN83Bf7gpR"]),
    600: Object.freeze(["EXhpiGrxPb7o"]),
  }),
  "zh-Hant": Object.freeze({
    400: Object.freeze(["Q9XcyYASXkdg"]),
    600: Object.freeze(["bYV8UwdabWUZ"]),
  }),
  ja: Object.freeze({
    400: Object.freeze(["UcH7DSpdiL7s"]),
    600: Object.freeze(["KSe3hgW8WEgM"]),
  }),
  ko: Object.freeze({
    400: Object.freeze(["EB7DfVu2MWGE"]),
    600: Object.freeze(["JRC3F9CpMikH"]),
  }),
});

const DEFAULT_TEMPLATE_ID = "default";
const LANGUAGE_SPECIFIC_FONT_SETS = new Set(["zh-Hans", "zh-Hant", "ja", "ko"]);
const DEFAULT_TEMPLATE_FONT_IDS = new Set(
  Object.values(DEFAULT_TEMPLATE_FONT_SETS).flatMap((fontSet) => [
    ...fontSet[400],
    ...fontSet[600],
  ]),
);
const DEFAULT_TEMPLATE_FONT_FILE_IDS = new Set([
  "Rp37wKfpY5os",
  "Jh8TM82HqieT",
  "ZHx7255RbJ5t",
  "JvxG1tGLKwkv",
  "FMDyvtH9dyuN",
  "8MXNvtBwPtTq",
  "EaK2s8ym6rdR",
  "pPCVTowexkmp",
  "B7grrxQ4V3Ck",
  "PqLnMqrManq1",
]);

const filterTreeByItemIds = (tree = [], itemIds) => {
  return tree.flatMap((entry) => {
    if (!itemIds.has(entry.id)) {
      return [];
    }

    const nextEntry = { ...entry };
    if (Array.isArray(entry.children)) {
      nextEntry.children = filterTreeByItemIds(entry.children, itemIds);
    }
    return [nextEntry];
  });
};

const resolveFontSetKey = (language) => {
  const normalizedLanguage = normalizeProjectLanguage(language);
  return LANGUAGE_SPECIFIC_FONT_SETS.has(normalizedLanguage)
    ? normalizedLanguage
    : "latin";
};

const rewriteDefaultTextStyleFonts = (templateData, fontSet) => {
  for (const textStyle of Object.values(templateData.textStyles?.items ?? {})) {
    const fontIds = Array.isArray(textStyle?.fontId)
      ? textStyle.fontId
      : [textStyle?.fontId];
    if (!fontIds.some((fontId) => DEFAULT_TEMPLATE_FONT_IDS.has(fontId))) {
      continue;
    }

    const selectedFontIds = fontSet[Number(textStyle.fontWeight)];
    if (selectedFontIds) {
      textStyle.fontId = [...selectedFontIds];
    }
  }
};

const pruneDefaultTemplateFonts = (templateData, selectedFontIds) => {
  const fontItems = templateData.fonts?.items;
  if (fontItems) {
    for (const fontId of DEFAULT_TEMPLATE_FONT_IDS) {
      if (!selectedFontIds.has(fontId)) {
        delete fontItems[fontId];
      }
    }

    templateData.fonts.tree = filterTreeByItemIds(
      templateData.fonts.tree,
      new Set(Object.keys(fontItems)),
    );
  }

  const fileItems = templateData.files?.items;
  if (fileItems) {
    for (const fileId of DEFAULT_TEMPLATE_FONT_FILE_IDS) {
      const fontUsesFile = Object.values(fontItems ?? {}).some(
        (font) => font?.fileId === fileId,
      );
      if (!fontUsesFile) {
        delete fileItems[fileId];
      }
    }

    templateData.files.tree = filterTreeByItemIds(
      templateData.files.tree,
      new Set(Object.keys(fileItems)),
    );
  }
};

export const resolveTemplateFontsForLanguage = ({
  templateId,
  templateData,
  language,
} = {}) => {
  const resolvedTemplateData = structuredClone(templateData);
  if (templateId !== DEFAULT_TEMPLATE_ID) {
    return resolvedTemplateData;
  }

  const fontSet = DEFAULT_TEMPLATE_FONT_SETS[resolveFontSetKey(language)];
  const selectedFontIds = new Set([...fontSet[400], ...fontSet[600]]);
  rewriteDefaultTextStyleFonts(resolvedTemplateData, fontSet);
  pruneDefaultTemplateFonts(resolvedTemplateData, selectedFontIds);
  return resolvedTemplateData;
};

export const filterTemplateFileIds = ({
  templateData,
  templateFileIds = [],
} = {}) => {
  const includedFileIds = new Set(
    Object.keys(templateData?.files?.items ?? {}),
  );
  return templateFileIds.filter((fileId) => includedFileIds.has(fileId));
};
