import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { extractFontWeightCapabilities } from "../src/internal/fontCapabilities.js";

const FONT_EXTENSIONS = new Set([".ttf", ".otf", ".woff", ".woff2"]);

const collectFontFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFontFiles(entryPath)));
      continue;
    }
    if (FONT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(entryPath);
    }
  }

  return files;
};

const corpusDirectory = process.argv[2];
if (!corpusDirectory) {
  throw new Error(
    "Usage: bun scripts/audit-font-weight-extraction.js <font-directory>",
  );
}

const fontFiles = (await collectFontFiles(corpusDirectory)).sort();
const results = [];

for (const fontPath of fontFiles) {
  const relativePath = path.relative(corpusDirectory, fontPath);
  const format = path.extname(fontPath).slice(1).toLowerCase();
  try {
    const capabilities = extractFontWeightCapabilities(
      await readFile(fontPath),
    );
    results.push({ relativePath, format, status: "ok", ...capabilities });
  } catch (error) {
    results.push({
      relativePath,
      format,
      status: "fallback",
      code: error?.code ?? "unknown_error",
    });
  }
}

for (const result of results) {
  if (result.status === "ok") {
    console.log(
      [
        "OK",
        result.format.toUpperCase(),
        result.kind,
        result.minWeight,
        result.defaultWeight,
        result.maxWeight,
        result.relativePath,
      ].join("\t"),
    );
    continue;
  }

  console.log(
    [
      "FALLBACK",
      result.format.toUpperCase(),
      result.code,
      result.relativePath,
    ].join("\t"),
  );
}

const formats = {};
for (const result of results) {
  const counts = formats[result.format] ?? { ok: 0, fallback: 0 };
  counts[result.status] += 1;
  formats[result.format] = counts;
}

console.log(
  JSON.stringify({
    total: results.length,
    ok: results.filter((result) => result.status === "ok").length,
    fallback: results.filter((result) => result.status === "fallback").length,
    static: results.filter((result) => result.kind === "static").length,
    variable: results.filter((result) => result.kind === "variable").length,
    formats,
  }),
);
