// Template packages the mock asset store serves. Each one is the app's
// bundled template under the template's own title and resolution, with the
// fonts for Latin scripts only, as an author's export would carry just the
// fonts its project uses. A package is a ZIP of stored entries:
// project-template.json, the manifest, and files/<id> for each file record.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { resolveTemplateFontsForLanguage } from "../src/internal/defaultTemplateFonts.js";
import { scaleTemplateProjectStateForResolution } from "../src/internal/projectResolution.js";

export const PROJECT_TEMPLATE_SCHEMA = "routevn.project-template.v1";
export const PROJECT_TEMPLATE_KIND = "routevn.creator.project-template";

const BUNDLED_TEMPLATE = new URL(
  "../static/templates/default/",
  import.meta.url,
);
const BUNDLED_TITLE = "MY VISUAL NOVEL";
const END_RECORD_BYTES = 22;
const END_SIGNATURE = 0x06054b50;
const ENTRY_DATE = new Date(Date.UTC(2026, 10, 23));

// Every `text` that reads `from` reads `to` instead.
const replaceText = (value, from, to) => {
  if (Array.isArray(value)) {
    value.forEach((item) => replaceText(item, from, to));
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "text" && child === from) value[key] = to;
    else replaceText(child, from, to);
  }
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/**
 * The package of `template`, a fixture template: `{bytes, size,
 * directoryOffset, directorySize}`, the offset and size of its central
 * directory read from its end record, as the asset store records them. With
 * `corrupt`, one file's bytes no longer match its record's `sha256`.
 */
export const buildMockTemplatePackage = async ({
  template,
  corrupt = false,
}) => {
  const { id, data } = template;
  const bundled = JSON.parse(
    await readFile(new URL("repository.json", BUNDLED_TEMPLATE), "utf8"),
  );
  const repository = scaleTemplateProjectStateForResolution(
    resolveTemplateFontsForLanguage({
      templateId: "default",
      templateData: bundled,
      language: "en",
    }),
    data.resolution,
  );
  replaceText(repository, BUNDLED_TITLE, data.title.toUpperCase());

  const zip = new JSZip();
  const manifest = {
    schema: PROJECT_TEMPLATE_SCHEMA,
    package: {
      kind: PROJECT_TEMPLATE_KIND,
      id,
      name: data.title,
      version: data.versionName,
    },
    creatorModelSchema: data.creatorModelSchema,
    repository,
  };
  zip.file("project-template.json", JSON.stringify(manifest), {
    date: ENTRY_DATE,
  });
  const fileIds = Object.keys(repository.files.items);
  for (const fileId of fileIds) {
    const record = repository.files.items[fileId];
    const bytes = await readFile(new URL(`files/${fileId}`, BUNDLED_TEMPLATE));
    if (bytes.length !== record.size || sha256(bytes) !== record.sha256) {
      throw new Error(`Bundled template file ${fileId} does not match.`);
    }
    if (corrupt && fileId === fileIds.at(-1)) bytes[0] ^= 0xff;
    zip.file(`files/${fileId}`, bytes, { date: ENTRY_DATE });
  }

  const bytes = await zip.generateAsync({
    type: "nodebuffer",
    compression: "STORE",
  });
  const end = bytes.length - END_RECORD_BYTES;
  if (bytes.readUInt32LE(end) !== END_SIGNATURE) {
    throw new Error("The template package has no end record.");
  }
  return {
    bytes,
    size: bytes.length,
    directorySize: bytes.readUInt32LE(end + 12),
    directoryOffset: bytes.readUInt32LE(end + 16),
  };
};
