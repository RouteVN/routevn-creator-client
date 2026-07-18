import { readFileSync } from "node:fs";
import yaml from "js-yaml";

const loadI18n = (locale) =>
  yaml.load(
    readFileSync(
      new URL(`../../src/i18n/${locale}.yaml`, import.meta.url),
      "utf8",
    ),
  );

export const EN_I18N = loadI18n("en");
export const JA_I18N = loadI18n("ja");
export const ZH_HANS_I18N = loadI18n("zh-hans");
