import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RESOURCE_VIEW_COMPONENTS = [
  "mediaResourcesView",
  "catalogResourcesView",
  "charactersResourcesView",
  "textStyleResourcesView",
  "groupVariablesView",
];

const RESOURCE_PAGES = [
  "animations",
  "characterSprites",
  "characters",
  "colors",
  "controls",
  "fonts",
  "images",
  "layouts",
  "particles",
  "sounds",
  "spritesheets",
  "textStyles",
  "transforms",
  "variables",
  "videos",
];

const readSource = (relativePath) =>
  readFileSync(new URL(`../../src/${relativePath}`, import.meta.url), "utf8");

describe("resource view background selection", () => {
  it.each(RESOURCE_VIEW_COMPONENTS)(
    "%s distinguishes background clicks from items and controls",
    (componentName) => {
      const view = readSource(
        `components/${componentName}/${componentName}.view.yaml`,
      );

      expect(view).toContain("handler: handleScrollContainerClick");
      expect(view).toContain("data-resource-view-item=true");
      expect(view).toContain("data-resource-view-control=true");
    },
  );

  it.each(RESOURCE_PAGES)(
    "%s clears selection from resource-view and explorer background clicks",
    (pageName) => {
      const view = readSource(`pages/${pageName}/${pageName}.view.yaml`);

      expect(view).toContain("background-click:");
      expect(view).toContain("handler: handleResourceViewBackgroundClick");
      expect(view).toContain("selection-cleared:");
      expect(view).toContain("handler: handleFileExplorerSelectionChanged");
    },
  );
});
