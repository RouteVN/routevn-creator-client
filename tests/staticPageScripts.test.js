import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const staticDir = path.resolve(import.meta.dirname, "../static");

const findPages = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const fullPath = path.join(dir, name);
    if (name === "public") return [];
    if (statSync(fullPath).isDirectory()) return findPages(fullPath);
    return name === "index.html" ? [fullPath] : [];
  });

const pages = findPages(staticDir)
  .map((file) => [path.relative(staticDir, file), readFileSync(file, "utf8")])
  .filter(([, html]) => html.includes("rettangoli-iife-ui"));

describe("static page scripts", () => {
  it("finds the app pages", () => {
    expect(pages.length).toBeGreaterThan(20);
  });

  // rtgl-icons.js calls rtgl.setIcons, which the Rettangoli UI script defines.
  it.each(pages)("loads the icons after Rettangoli UI in %s", (_page, html) => {
    const rettangoliIndex = html.indexOf("rettangoli-iife-ui");
    const iconsIndex = html.indexOf("rtgl-icons.js");

    expect(iconsIndex).toBeGreaterThan(rettangoliIndex);
  });
});
