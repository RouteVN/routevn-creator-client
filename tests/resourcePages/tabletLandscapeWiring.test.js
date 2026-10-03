import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mediaFactoryPages = ["fonts", "images", "sounds", "videos"];
const catalogFactoryPages = [
  "animations",
  "audioEffects",
  "colors",
  "controls",
  "layouts",
  "particles",
  "transforms",
];
const customPages = [
  "characters",
  "characterSprites",
  "spritesheets",
  "textStyles",
  "variables",
];
const pages = [...mediaFactoryPages, ...catalogFactoryPages, ...customPages];

const readSource = (relativePath) =>
  readFileSync(new URL(`../../src/${relativePath}`, import.meta.url), "utf8");

describe("tablet landscape explorer wiring", () => {
  it.each(pages)("%s renders the persistent explorer pane", (page) => {
    const view = readSource(`pages/${page}/${page}.view.yaml`);
    const paneStart = view.indexOf("$if showTabletLandscapeExplorer");
    const pane = view.slice(
      paneStart,
      view.indexOf("pl=${contentLeftPadding}"),
    );
    const explorerLine = pane
      .split("\n")
      .find((line) => line.includes("rvn-base-file-explorer#file"));

    expect(paneStart).toBeGreaterThan(-1);
    expect(pane).toContain("w=${tabletLandscapeExplorerWidth}");
    expect(pane).toContain("${filesLabel}");
    expect(explorerLine).toContain("show-item-menu-actions");
    expect(explorerLine).toContain(
      ":emptyContextMenuItems=${emptyContextMenuItems}",
    );
    expect(view).toContain(":showMenuButton=${showMobileMenuButton}");
    expect(view).not.toMatch(/ show-menu-button[ '"]/);
  });

  it.each(pages)("%s store exposes window metrics", async (page) => {
    const store = await import(`../../src/pages/${page}/${page}.store.js`);
    const state = store.createInitialState();

    store.setUiConfig({ state }, { uiConfig: { inputMode: "touch" } });
    store.setAppWindowMetrics({ state }, { width: 1280, height: 800 });
    expect(store.selectIsTabletLandscape({ state })).toBe(true);

    store.setAppWindowMetrics({ state }, { width: 800, height: 1280 });
    expect(store.selectIsTabletLandscape({ state })).toBe(false);
  });

  it.each(customPages)("%s subscribes to window metrics", (page) => {
    const handlers = readSource(`pages/${page}/${page}.handlers.js`);

    expect(handlers).toContain(
      "const cleanupWindowLayout = mountMobileResourceWindowLayout(deps);",
    );
    expect(handlers).toContain("cleanupWindowLayout?.();");
  });

  it.each([
    ["media", "internal/ui/resourcePages/media/createMediaPageHandlers.js"],
    [
      "catalog",
      "internal/ui/resourcePages/catalog/createCatalogPageHandlers.js",
    ],
  ])("the %s factory subscribes to window metrics", (_name, path) => {
    const handlers = readSource(path);

    expect(handlers).toContain(
      "const cleanupWindowLayout = mountMobileResourceWindowLayout(deps);",
    );
    expect(handlers).toContain("cleanupWindowLayout?.();");
  });
});
