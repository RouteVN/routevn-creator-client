/**
 * Static detection of SSR hazards in the first-render path.
 *
 * Execution tests cannot catch these. A store that does
 *
 *     toPositiveDimension(globalThis.window?.innerWidth) ?? FALLBACK
 *
 * does not throw in Node -- it quietly returns the fallback. So the server
 * renders one value, the client renders another, and hydration bails to CSR
 * with no error anywhere. GUARDED browser access is more dangerous than
 * unguarded, because unguarded at least fails loudly.
 *
 * The allowlist below records what exists today. The test fails when a NEW
 * offender appears, which is how you adopt a rule into an existing codebase
 * without a big-bang cleanup.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");

/** Browser globals whose value cannot be reproduced on a server. */
const HAZARDS = [
  "window",
  "document",
  "navigator",
  "localStorage",
  "sessionStorage",
  "matchMedia",
  "requestAnimationFrame",
  "getComputedStyle",
];

/**
 * Known offenders. Each entry is a real server/client divergence, not a false
 * positive -- fix them rather than growing this list.
 */
const ALLOWLIST = new Set([
  // Reads viewport size to compute preview dimensions; server falls back to a
  // constant, so the first render differs from the client's on every viewport.
  "vnPreview",
  // Derives route ids from window.location inside selectViewData; the server
  // has the URL but not via this channel.
  "mobileSidebar",
]);

/** Remove string and template literals so `"document-${x}"` is not a match. */
const stripLiterals = (source) =>
  source
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

const storeFiles = () => {
  const out = [];
  for (const base of ["src/components", "src/pages"]) {
    const dir = path.join(ROOT, base);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const file = path.join(dir, entry.name, `${entry.name}.store.js`);
      if (existsSync(file)) out.push({ name: entry.name, file });
    }
  }
  return out;
};

const findHazards = (source) => {
  const code = stripLiterals(source);
  const found = new Set();
  for (const global of HAZARDS) {
    // `window.x`, `globalThis.window`, or a bare reference used as a value.
    const re = new RegExp(`(?:globalThis\\.)?\\b${global}\\b\\s*(?:\\.|\\?\\.|\\[|\\()`, "g");
    if (re.test(code)) found.add(global);
  }
  return [...found];
};

describe("SSR hazards in stores", () => {
  const files = storeFiles();

  it("finds stores to scan", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("no NEW store reads browser globals in the first-render path", () => {
    const offenders = [];
    for (const { name, file } of files) {
      if (ALLOWLIST.has(name)) continue;
      const hazards = findHazards(readFileSync(file, "utf8"));
      if (hazards.length) offenders.push(`${name}.store.js -> ${hazards.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });

  it("allowlisted offenders still exist (remove them from the list once fixed)", () => {
    const stale = [];
    for (const name of ALLOWLIST) {
      const entry = files.find((f) => f.name === name);
      if (!entry) {
        stale.push(`${name} (no such store)`);
        continue;
      }
      if (findHazards(readFileSync(entry.file, "utf8")).length === 0) {
        stale.push(`${name} (now clean -- drop it from ALLOWLIST)`);
      }
    }
    expect(stale).toEqual([]);
  });

  it("does not flag the word 'document' inside string literals", () => {
    const sample = 'const k = `document-${id}-suffix`; const s = "document-x";';
    expect(findHazards(sample)).toEqual([]);
  });

  it("does flag a guarded browser read, which is the silent case", () => {
    const sample = "const w = globalThis.window?.innerWidth ?? 1024;";
    expect(findHazards(sample)).toContain("window");
  });
});
