import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BASE58_ALPHABET, DEFAULT_ID_LENGTH } from "../../src/internal/id.js";

const defaultRepositoryTemplate = JSON.parse(
  readFileSync(
    new URL("../../static/templates/default/repository.json", import.meta.url),
    "utf8",
  ),
);
const defaultTemplateFiles = JSON.parse(
  readFileSync(
    new URL("../../static/templates/default/files/files.json", import.meta.url),
    "utf8",
  ),
);
const defaultTemplateFileNames = readdirSync(
  new URL("../../static/templates/default/files", import.meta.url),
).filter((fileName) => fileName !== "files.json");
const defaultIdRegex = new RegExp(
  `^[${BASE58_ALPHABET}]{${DEFAULT_ID_LENGTH}}$`,
);

const collectTemplateIds = (value, ids = new Set()) => {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectTemplateIds(entry, ids);
    }
    return ids;
  }

  if (!value || typeof value !== "object") {
    return ids;
  }

  for (const [key, entry] of Object.entries(value)) {
    if ((key === "id" || key.endsWith("Id")) && typeof entry === "string") {
      ids.add(entry);
    }

    if (
      key === "items" &&
      entry &&
      typeof entry === "object" &&
      !Array.isArray(entry)
    ) {
      for (const itemKey of Object.keys(entry)) {
        ids.add(itemKey);
      }
    }

    collectTemplateIds(entry, ids);
  }

  return ids;
};

describe("default template id format", () => {
  it("uses the current default id format everywhere in repository data", () => {
    const ids = collectTemplateIds(defaultRepositoryTemplate);
    for (const fileId of defaultTemplateFiles.files ?? []) {
      ids.add(fileId);
    }

    const invalidIds = [...ids]
      .filter((id) => typeof id === "string" && id.length > 0)
      .filter((id) => !defaultIdRegex.test(id))
      .sort();

    expect(invalidIds).toEqual([]);
  });

  it("keeps the template file manifest aligned with on-disk files", () => {
    expect([...defaultTemplateFiles.files].sort()).toEqual(
      [...defaultTemplateFileNames].sort(),
    );
  });
});
