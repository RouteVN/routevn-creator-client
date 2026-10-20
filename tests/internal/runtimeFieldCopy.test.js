import { describe, expect, it } from "vitest";
import { getRuntimeFieldItems } from "../../src/internal/runtimeFields.js";
import { selectRuntimeFieldTexts } from "../../src/internal/ui/runtimeFieldCopy.js";
import { EN_I18N, FR_I18N, JA_I18N, PT_I18N } from "../support/i18n.js";

describe("runtimeFieldCopy", () => {
  it("names and describes every runtime field in English as runtimeFields.js does", () => {
    const texts = selectRuntimeFieldTexts(EN_I18N);

    for (const field of Object.values(getRuntimeFieldItems())) {
      expect(texts[field.id]).toEqual({
        name: field.name,
        description: field.description,
      });
    }
  });

  it.each([
    ["ja", JA_I18N],
    ["pt", PT_I18N],
    ["fr", FR_I18N],
  ])(
    "translates every runtime field's name and description in %s",
    (_, i18n) => {
      const texts = selectRuntimeFieldTexts(i18n);

      for (const field of Object.values(getRuntimeFieldItems())) {
        expect(texts[field.id].name).not.toBe(field.name);
        expect(texts[field.id].description).not.toBe(field.description);
      }
    },
  );
});
