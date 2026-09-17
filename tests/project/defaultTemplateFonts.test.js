import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPLATE_FONT_SETS,
  filterTemplateFileIds,
  resolveTemplateFontsForLanguage,
} from "../../src/internal/defaultTemplateFonts.js";
import { extractFontWeightCapabilities } from "../../src/internal/fontCapabilities.js";
import { PROJECT_LANGUAGES } from "../../src/internal/projectLanguage.js";
import { assertSupportedProjectState } from "../../src/deps/services/shared/projectRepository.js";
import { scaleTemplateProjectStateForResolution } from "../../src/internal/projectResolution.js";

const repository = JSON.parse(
  readFileSync(
    new URL("../../static/templates/default/repository.json", import.meta.url),
    "utf8",
  ),
);

const fontCases = [
  ["7m7oC7i8JTEE", "Rp37wKfpY5os", 400],
  ["VWNPTSU9Rbn9", "Jh8TM82HqieT", 600],
  ["Z2HN83Bf7gpR", "ZHx7255RbJ5t", 400],
  ["EXhpiGrxPb7o", "JvxG1tGLKwkv", 600],
  ["Q9XcyYASXkdg", "FMDyvtH9dyuN", 400],
  ["bYV8UwdabWUZ", "8MXNvtBwPtTq", 600],
  ["UcH7DSpdiL7s", "EaK2s8ym6rdR", 400],
  ["KSe3hgW8WEgM", "pPCVTowexkmp", 600],
  ["EB7DfVu2MWGE", "B7grrxQ4V3Ck", 400],
  ["JRC3F9CpMikH", "PqLnMqrManq1", 600],
];

const resolutionCases = [
  ["en", "latin"],
  ["fr", "latin"],
  ["ar", "latin"],
  ["ja", "ja"],
  ["zh-Hans", "zh-Hans"],
  ["zh-Hant", "zh-Hant"],
  ["ko", "ko"],
];

const selectFontItems = (templateData) => {
  return Object.fromEntries(
    Object.entries(templateData.fonts.items).filter(
      ([, item]) => item.type === "font",
    ),
  );
};

const selectFontFileIds = (templateData) => {
  return Object.values(templateData.files.items)
    .filter((item) => item.type === "font")
    .map((item) => item.id)
    .sort();
};

describe("default template fonts", () => {
  it.each(fontCases)(
    "ships font %s from %s as a real static %i-weight WOFF2",
    (fontId, fileId, weight) => {
      const font = repository.fonts.items[fontId];
      const file = repository.files.items[fileId];
      const bytes = readFileSync(
        new URL(
          `../../static/templates/default/files/${fileId}`,
          import.meta.url,
        ),
      );

      expect(font.fileId).toBe(fileId);
      expect(font).toMatchObject({
        minWeight: weight,
        defaultWeight: weight,
        maxWeight: weight,
      });
      expect(file.mimeType).toBe("font/woff2");
      expect(file.size).toBe(bytes.byteLength);
      expect(file.sha256).toBe(
        createHash("sha256").update(bytes).digest("hex"),
      );
      expect(extractFontWeightCapabilities(bytes)).toEqual({
        kind: "static",
        defaultWeight: weight,
        minWeight: weight,
        maxWeight: weight,
      });
    },
  );

  it.each(resolutionCases)(
    "resolves %s projects to the %s font set",
    (language, fontSetKey) => {
      const resolvedTemplate = resolveTemplateFontsForLanguage({
        templateId: "default",
        templateData: repository,
        language,
      });
      const expectedFontSet = DEFAULT_TEMPLATE_FONT_SETS[fontSetKey];
      const expectedFontIds = [
        ...expectedFontSet[400],
        ...expectedFontSet[600],
      ];
      const fontItems = selectFontItems(resolvedTemplate);

      expect(() =>
        assertSupportedProjectState(
          scaleTemplateProjectStateForResolution(resolvedTemplate, {
            width: 1920,
            height: 1080,
          }),
        ),
      ).not.toThrow();
      expect(Object.keys(fontItems).sort()).toEqual(
        [...expectedFontIds].sort(),
      );
      expect(selectFontFileIds(resolvedTemplate)).toEqual(
        expectedFontIds.map((fontId) => fontItems[fontId].fileId).sort(),
      );

      for (const textStyle of Object.values(
        resolvedTemplate.textStyles.items,
      ).filter((item) => item.type === "textStyle")) {
        expect(textStyle.fontId).toEqual(
          expectedFontSet[Number(textStyle.fontWeight)],
        );
      }
    },
  );

  it("defaults every other supported project language to Latin", () => {
    const languageSpecificFontSets = new Set([
      "ja",
      "zh-Hans",
      "zh-Hant",
      "ko",
    ]);

    for (const language of PROJECT_LANGUAGES.filter(
      (value) => !languageSpecificFontSets.has(value),
    )) {
      const resolvedTemplate = resolveTemplateFontsForLanguage({
        templateId: "default",
        templateData: repository,
        language,
      });

      expect(Object.keys(selectFontItems(resolvedTemplate)).sort()).toEqual(
        [
          ...DEFAULT_TEMPLATE_FONT_SETS.latin[400],
          ...DEFAULT_TEMPLATE_FONT_SETS.latin[600],
        ].sort(),
      );
    }
  });

  it("filters the template manifest to files retained by language resolution", () => {
    const resolvedTemplate = resolveTemplateFontsForLanguage({
      templateId: "default",
      templateData: repository,
      language: "ja",
    });
    const manifestFileIds = Object.keys(repository.files.items);
    const copiedFileIds = filterTemplateFileIds({
      templateData: resolvedTemplate,
      templateFileIds: manifestFileIds,
    });

    expect(copiedFileIds).toEqual(Object.keys(resolvedTemplate.files.items));
    expect(
      copiedFileIds.filter(
        (fileId) => repository.files.items[fileId].type === "font",
      ),
    ).toEqual(["EaK2s8ym6rdR", "pPCVTowexkmp"]);
  });

  it("does not mutate or specialize other templates", () => {
    const templateData = structuredClone(repository);
    const resolvedTemplate = resolveTemplateFontsForLanguage({
      templateId: "custom",
      templateData,
      language: "ja",
    });

    expect(resolvedTemplate).toEqual(templateData);
    expect(resolvedTemplate).not.toBe(templateData);
  });
});
