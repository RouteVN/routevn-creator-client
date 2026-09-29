import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const publicDir = new URL("../static/public/", import.meta.url);
await mkdir(publicDir, { recursive: true });

// Older macOS WebKit needs this before either Rettangoli bundle evaluates.
// Copy the installed dependency unchanged so desktop startup also works offline.
await copyFile(
  fileURLToPath(import.meta.resolve("construct-style-sheets-polyfill")),
  new URL("adoptedStyleSheets.js", publicDir),
);
