import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";

const readCatalog = (locale) =>
  yaml.load(
    readFileSync(
      new URL(`../../src/i18n/${locale}.yaml`, import.meta.url),
      "utf8",
    ),
  );

describe("computed variable localization", () => {
  it("keeps computed-variable copy aligned in every catalog", () => {
    const catalogs = ["en", "ja", "zh-hans"].map(readCatalog);
    const requiredKeys = Object.keys(catalogs[0].variablesPage).filter(
      (key) =>
        key.startsWith("computed") ||
        [
          "valueSourceLabel",
          "variableSourceLabel",
          "variableTypeObjectLabel",
          "moveUpLabel",
          "moveDownLabel",
        ].includes(key),
    );

    catalogs.forEach((catalog) => {
      expect(Object.keys(catalog.variablesPage)).toEqual(
        expect.arrayContaining(requiredKeys),
      );
      requiredKeys.forEach((key) => {
        expect(catalog.variablesPage[key]).toEqual(expect.any(String));
      });
    });
  });
});
