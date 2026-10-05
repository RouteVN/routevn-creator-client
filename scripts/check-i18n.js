// Checks every app locale catalog against the default locale: same keys,
// same {placeholders}, and the same value types. The Rettangoli build only
// reports missing keys, and only after the slower CI steps have run.
import { readFileSync } from "node:fs";
import yaml from "js-yaml";

const loadYaml = (filePath) => yaml.load(readFileSync(filePath, "utf8")) ?? {};

const { dir, defaultLocale, locales } = loadYaml("rettangoli.config.yaml").fe
  .i18n;

const flattenCatalog = (node, prefix) =>
  Object.entries(node).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") {
      return flattenCatalog(value, path);
    }
    return [[path, value]];
  });

const loadCatalog = (locale) =>
  new Map(flattenCatalog(loadYaml(`${dir}/${locale}.yaml`)));

const listPlaceholders = (value) =>
  [...new Set(String(value).match(/\{[^{}]+\}/g))].sort().join(" ");

const defaultCatalog = loadCatalog(defaultLocale);
const problems = [];

for (const locale of locales) {
  if (locale === defaultLocale) {
    continue;
  }

  const catalog = loadCatalog(locale);
  const file = `${dir}/${locale}.yaml`;

  for (const [key, defaultValue] of defaultCatalog) {
    if (!catalog.has(key)) {
      problems.push(`${file}: missing "${key}"`);
      continue;
    }

    const value = catalog.get(key);
    if (typeof value !== typeof defaultValue) {
      problems.push(
        `${file}: "${key}" is a ${typeof value}, but ${defaultLocale} has a ${typeof defaultValue}`,
      );
      continue;
    }
    if (typeof value === "string" && value.trim() === "") {
      problems.push(`${file}: "${key}" is empty`);
      continue;
    }

    const placeholders = listPlaceholders(value);
    const defaultPlaceholders = listPlaceholders(defaultValue);
    if (placeholders !== defaultPlaceholders) {
      problems.push(
        `${file}: "${key}" has placeholders [${placeholders}], but ${defaultLocale} has [${defaultPlaceholders}]`,
      );
    }
  }

  for (const key of catalog.keys()) {
    if (!defaultCatalog.has(key)) {
      problems.push(`${file}: "${key}" is not in ${defaultLocale}`);
    }
  }
}

if (problems.length > 0) {
  console.error(
    `i18n check failed with ${problems.length} problem(s). Every locale in rettangoli.config.yaml must match ${dir}/${defaultLocale}.yaml.`,
  );
  for (const problem of problems) {
    console.error(`- ${problem}`);
  }
  process.exit(1);
}

console.log(
  `i18n check passed: ${locales.length} locales, ${defaultCatalog.size} keys each.`,
);
