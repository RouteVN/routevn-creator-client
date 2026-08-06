/**
 * Guards the SSR consistency invariant:
 *
 *   The client's first render must be a pure function of the same inputs the
 *   server used -- props, constants, and an explicit environment.
 *
 * These are the tests that catch a violation BEFORE it becomes a silent
 * hydration mismatch in production. A mismatch degrades to CSR rather than
 * corrupting, so nothing visibly breaks -- which is exactly why it needs a
 * gate rather than manual QA.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import yaml from "js-yaml";

import { renderComponentTree, buildRegistry } from "../lib/render.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const RENDER = { root: ROOT, rootTag: "rvn-app", nestedShadow: true };

const componentDirs = () => {
  const out = [];
  for (const base of ["src/components", "src/pages"]) {
    const dir = path.join(ROOT, base);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) out.push({ base, name: entry.name, dir: path.join(dir, entry.name) });
    }
  }
  return out;
};

describe("determinism", () => {
  it("renders byte-identical output across repeated runs", async () => {
    const a = await renderComponentTree(RENDER);
    const b = await renderComponentTree(RENDER);
    const c = await renderComponentTree(RENDER);
    // Any Date.now()/Math.random()/iteration-order dependence shows up here.
    expect(a.html).toBe(b.html);
    expect(b.html).toBe(c.html);
  });

  it("renders identically regardless of ambient wall-clock", async () => {
    const before = await renderComponentTree(RENDER);
    const realNow = Date.now;
    Date.now = () => 1_700_000_000_000;
    try {
      const shifted = await renderComponentTree(RENDER);
      expect(shifted.html).toBe(before.html);
    } finally {
      Date.now = realNow;
    }
  });
});

describe("server purity of stores", () => {
  const dirs = componentDirs();

  it("finds components to check", () => {
    expect(dirs.length).toBeGreaterThan(50);
  });

  it("every store imports in bare Node with no DOM", async () => {
    expect(typeof globalThis.document).toBe("undefined");
    const failures = [];
    for (const { name, dir } of dirs) {
      const file = path.join(dir, `${name}.store.js`);
      if (!existsSync(file)) continue;
      try {
        await import(pathToFileURL(file).href);
      } catch (error) {
        failures.push(`${name}.store.js: ${error.message}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("createInitialState and selectViewData run without browser globals", async () => {
    const i18n = yaml.load(readFileSync(path.join(ROOT, "src/i18n/en.yaml"), "utf8"));
    const failures = [];
    for (const { name, dir } of dirs) {
      const file = path.join(dir, `${name}.store.js`);
      if (!existsSync(file)) continue;
      let store;
      try {
        store = await import(pathToFileURL(file).href);
      } catch {
        continue; // covered by the import test above
      }
      if (typeof store.selectViewData !== "function") continue;
      try {
        const state = store.createInitialState
          ? store.createInitialState({ props: {}, constants: {} })
          : {};
        store.selectViewData({ state, props: {}, constants: {}, i18n, locale: "en" });
      } catch (error) {
        // A store that needs specific props is fine; one that needs `window`
        // is not -- that is an SSR blocker and a testability problem.
        if (/window|document|navigator|localStorage|matchMedia/.test(error.message)) {
          failures.push(`${name}: ${error.message}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

describe("no non-determinism in the first-render path", () => {
  it("no store reads Math.random or Date.now inside selectViewData", () => {
    const offenders = [];
    for (const { name, dir } of componentDirs()) {
      const file = path.join(dir, `${name}.store.js`);
      if (!existsSync(file)) continue;
      const source = readFileSync(file, "utf8");
      const selector = source.slice(source.indexOf("selectViewData"));
      if (!selector) continue;
      // Only the selector body matters -- actions may legitimately use both.
      const body = selector.slice(0, selector.indexOf("\nexport ") + 1 || undefined);
      if (/Math\.random\(|Date\.now\(/.test(body)) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });
});

describe("component registry", () => {
  it("every componentName is unique", () => {
    const registry = buildRegistry(ROOT);
    const names = [...registry.keys()];
    expect(new Set(names).size).toBe(names.length);
  });

  it("renders the full tree with zero failures", async () => {
    const { stats } = await renderComponentTree(RENDER);
    expect(stats.failed).toEqual([]);
    expect(stats.componentCount).toBeGreaterThan(0);
  });
});

describe("emitted markup shape", () => {
  it("marks every fe component host for hydration", async () => {
    const { html } = await renderComponentTree(RENDER);
    const hosts = html.match(/<rvn-[a-z-]+/g) ?? [];
    const marked = html.match(/data-rtgl-hydrate/g) ?? [];
    // Every rendered component host carries the flag (the root is marked by
    // the shell, so hosts here are the nested ones).
    expect(marked.length).toBeGreaterThanOrEqual(hosts.length - 1);
  });

  it("gives every hydratable host its own render target", async () => {
    const { html } = await renderComponentTree(RENDER);
    const templates = html.match(/<template shadowrootmode="open">/g) ?? [];
    const targets = html.match(/data-rtgl-render-target/g) ?? [];
    expect(targets.length).toBe(templates.length);
  });

  it("never leaks object props into the markup", async () => {
    const { html } = await renderComponentTree(RENDER);
    expect(html).not.toContain("[object Object]");
    expect(html).not.toContain("undefined=");
  });

  it("produces markup with balanced custom-element tags", async () => {
    const { html } = await renderComponentTree(RENDER);
    for (const tag of ["rtgl-view", "rtgl-text", "rvn-projects"]) {
      const open = (html.match(new RegExp(`<${tag}[ >]`, "g")) ?? []).length;
      const close = (html.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
      expect(`${tag}:${open}`).toBe(`${tag}:${close}`);
    }
  });
});
