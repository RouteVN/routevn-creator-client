import { describe, expect, it } from "vitest";
import { EN_I18N, JA_I18N, ZH_HANS_I18N } from "../support/i18n.js";

const flattenKeys = (value, prefix = "") => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
};

const EN_KEYS = flattenKeys(EN_I18N).sort();

const LOCALES = [
  { name: "ja", catalog: JA_I18N },
  { name: "zh-hans", catalog: ZH_HANS_I18N },
];

describe("i18n locale parity", () => {
  it("has a non-trivial english catalog to compare against", () => {
    expect(EN_KEYS.length).toBeGreaterThan(1000);
  });

  LOCALES.forEach(({ name, catalog }) => {
    const keys = flattenKeys(catalog).sort();

    it(`${name} defines every english key`, () => {
      const missing = EN_KEYS.filter((key) => !keys.includes(key));
      expect(missing).toEqual([]);
    });

    it(`${name} defines no keys english lacks`, () => {
      const extra = keys.filter((key) => !EN_KEYS.includes(key));
      expect(extra).toEqual([]);
    });

    it(`${name} has no empty strings`, () => {
      const empty = keys.filter((key) => {
        const value = key
          .split(".")
          .reduce((node, part) => node?.[part], catalog);
        return typeof value === "string" && value.trim() === "";
      });
      expect(empty).toEqual([]);
    });
  });
});
