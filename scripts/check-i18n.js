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

// A count message is a family of keys named after CLDR plural categories,
// such as `actionCount_one` and `actionCount_other` (see i18nCopy.js). The
// default locale defines each family with its own categories, so every
// locale has those keys. A locale adds the other categories its plural rules
// use for whole numbers, such as `_few` and `_many` for Russian, and must not
// add categories its rules never select.
const PLURAL_KEY = /^(.+)_(zero|one|two|few|many|other)$/;

const parsePluralKey = (key) => {
  const match = key.match(PLURAL_KEY);
  return match ? { family: match[1], category: match[2] } : undefined;
};

const pluralFamilies = new Map();
for (const key of defaultCatalog.keys()) {
  const pluralKey = parsePluralKey(key);
  if (pluralKey) {
    const categories = pluralFamilies.get(pluralKey.family) ?? new Set();
    categories.add(pluralKey.category);
    pluralFamilies.set(pluralKey.family, categories);
  }
}

const listPluralCategories = (catalog, locale) => {
  const rules = new Intl.PluralRules(
    catalog.get("dateTime.pluralRulesLocale") ?? locale,
  );
  const wholeNumberCategories = new Set(["other"]);
  for (let count = 0; count < 200; count += 1) {
    wholeNumberCategories.add(rules.select(count));
  }
  return {
    allowed: new Set(rules.resolvedOptions().pluralCategories),
    required: wholeNumberCategories,
  };
};

const checkPluralFamilies = (catalog, locale, file) => {
  const { allowed, required } = listPluralCategories(catalog, locale);
  for (const [family, defaultCategories] of pluralFamilies) {
    for (const category of required) {
      if (!catalog.has(`${family}_${category}`)) {
        problems.push(
          `${file}: missing "${family}_${category}", which ${locale}'s plural rules use`,
        );
      }
    }
    for (const key of catalog.keys()) {
      const pluralKey = parsePluralKey(key);
      if (
        pluralKey?.family === family &&
        !defaultCategories.has(pluralKey.category) &&
        !allowed.has(pluralKey.category)
      ) {
        problems.push(
          `${file}: "${key}" is a plural category that ${locale}'s plural rules never select`,
        );
      }
    }
  }
};

// True for an added plural key, such as `actionCount_few`, whose family the
// default locale defines.
const isAddedPluralKey = (key) => {
  const pluralKey = parsePluralKey(key);
  return Boolean(
    pluralKey &&
      pluralFamilies.has(pluralKey.family) &&
      !defaultCatalog.has(key),
  );
};

for (const [family, categories] of pluralFamilies) {
  if (!categories.has("other")) {
    problems.push(
      `${dir}/${defaultLocale}.yaml: "${family}" has no "${family}_other" key`,
    );
  }
}
checkPluralFamilies(
  defaultCatalog,
  defaultLocale,
  `${dir}/${defaultLocale}.yaml`,
);

// Rettangoli reads a "." in a key as a nested path, so the build reports
// such a key as missing in every other locale. Map English sentences that
// end with a period to camelCase keys instead (see commandLineCopy.js).
const listDottedKeys = (node, prefix) =>
  Object.entries(node).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    const nested =
      value && typeof value === "object" ? listDottedKeys(value, path) : [];
    return key.includes(".") ? [path, ...nested] : nested;
  });
for (const key of listDottedKeys(loadYaml(`${dir}/${defaultLocale}.yaml`))) {
  problems.push(
    `${dir}/${defaultLocale}.yaml: "${key}" contains ".", which Rettangoli reads as a nested key`,
  );
}

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

  checkPluralFamilies(catalog, locale, file);

  for (const key of catalog.keys()) {
    if (isAddedPluralKey(key)) {
      const { family } = parsePluralKey(key);
      const placeholders = listPlaceholders(catalog.get(key));
      const defaultPlaceholders = listPlaceholders(
        defaultCatalog.get(`${family}_other`),
      );
      if (placeholders !== defaultPlaceholders) {
        problems.push(
          `${file}: "${key}" has placeholders [${placeholders}], but ${defaultLocale} "${family}_other" has [${defaultPlaceholders}]`,
        );
      }
      continue;
    }
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
