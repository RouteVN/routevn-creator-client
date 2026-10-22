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
// such as `actionCount_one` and `actionCount_other` (see i18nCopy.js). A
// family is a name with an `_other` key in the default locale, so snake_case
// keys such as the error code `too_many_files` are left alone.
// Every locale has the default locale's keys. A locale adds the categories
// its plural rules select below 200, such as `_few` and `_many` for Russian,
// may add ones they select only for larger numbers, such as `_many` for
// French millions, and must not add categories its rules never select.
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
for (const [family, categories] of pluralFamilies) {
  if (!categories.has("other")) {
    pluralFamilies.delete(family);
  } else if (!categories.has("one")) {
    problems.push(
      `${dir}/${defaultLocale}.yaml: "${family}_other" has no "${family}_one" key`,
    );
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

const defaultPluralCategories = listPluralCategories(
  defaultCatalog,
  defaultLocale,
).allowed;
for (const [family, categories] of pluralFamilies) {
  // Every locale copies the default locale's keys, so a category it never
  // selects would add a key no locale can show.
  for (const category of categories) {
    if (!defaultPluralCategories.has(category)) {
      problems.push(
        `${dir}/${defaultLocale}.yaml: "${family}_${category}" is a plural category that ${defaultLocale}'s plural rules never select`,
      );
    }
  }
  // Every form shows the same values, so a form such as "1 branch" cannot
  // hard-code a number that another count in its category would also use.
  const otherPlaceholders = listPlaceholders(
    defaultCatalog.get(`${family}_other`),
  );
  for (const category of categories) {
    const placeholders = listPlaceholders(
      defaultCatalog.get(`${family}_${category}`),
    );
    if (placeholders !== otherPlaceholders) {
      problems.push(
        `${dir}/${defaultLocale}.yaml: "${family}_${category}" has placeholders [${placeholders}], but "${family}_other" has [${otherPlaceholders}]`,
      );
    }
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
      const value = catalog.get(key);
      if (typeof value !== "string" || value.trim() === "") {
        problems.push(`${file}: "${key}" is empty`);
        continue;
      }
      const placeholders = listPlaceholders(value);
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
