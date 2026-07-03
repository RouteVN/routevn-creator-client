import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const resourcePages = [
  [
    "character sprites",
    "characterSprites/characterSprites.view.yaml",
    "groupCharacterSpritesView.itemsPerRow",
  ],
  ["colors", "colors/colors.view.yaml", "groupColorsView.itemsPerRow"],
  ["controls", "controls/controls.view.yaml", "groupControlsView.itemsPerRow"],
  ["fonts", "fonts/fonts.view.yaml", "groupFontsView.itemsPerRow"],
  ["images", "images/images.view.yaml", "groupImagesView.itemsPerRow"],
  ["layouts", "layouts/layouts.view.yaml", "groupLayoutsView.itemsPerRow"],
  [
    "particles",
    "particles/particles.view.yaml",
    "groupParticlesView.itemsPerRow",
  ],
  ["sounds", "sounds/sounds.view.yaml", "groupSoundsView.itemsPerRow"],
  [
    "spritesheets",
    "spritesheets/spritesheets.view.yaml",
    "groupSpritesheetsView.itemsPerRow",
  ],
  [
    "text styles",
    "textStyles/textStyles.view.yaml",
    "groupTextStylesView.itemsPerRow",
  ],
  [
    "transforms",
    "transforms/transforms.view.yaml",
    "groupTransformsView.itemsPerRow",
  ],
  ["videos", "videos/videos.view.yaml", "groupVideosView.itemsPerRow"],
];

const fullWidthResourcePages = [
  ["animations", "animations/animations.view.yaml"],
  ["characters", "characters/characters.view.yaml"],
];

const mobileMenuResourcePages = [
  ...resourcePages.map(([name, relativePath]) => [name, relativePath]),
  ...fullWidthResourcePages,
  ["variables", "variables/variables.view.yaml"],
];

const mobileIconOnlyImportPages = [
  ["animations", "animations/animations.view.yaml"],
  ["transforms", "transforms/transforms.view.yaml"],
];

const readMobileBranch = (relativePath) => {
  const view = readFileSync(
    new URL(`../../src/pages/${relativePath}`, import.meta.url),
    "utf8",
  );
  const mobileBranchStart = view.indexOf("$if showMobileTopTabs");
  const desktopBranchStart = view.indexOf("$else:", mobileBranchStart);

  return view.slice(mobileBranchStart, desktopBranchStart);
};

describe("mobile resource grid zoom wiring", () => {
  it.each(resourcePages)(
    "uses the mobile column default for %s",
    (_name, relativePath, configKey) => {
      const mobileBranch = readMobileBranch(relativePath);

      expect(mobileBranch).toContain("show-zoom-controls");
      expect(mobileBranch).toContain("zoom-control-mode=columns");
      expect(mobileBranch).toContain("default-items-per-row=2");
      expect(mobileBranch).toContain(`items-per-row-config-key="${configKey}"`);
    },
  );

  it.each(fullWidthResourcePages)(
    "does not apply column zoom to full-width %s resources",
    (_name, relativePath) => {
      const mobileBranch = readMobileBranch(relativePath);

      expect(mobileBranch).not.toContain("show-zoom-controls");
      expect(mobileBranch).not.toContain("zoom-control-mode=columns");
      expect(mobileBranch).not.toContain("default-items-per-row=2");
      expect(mobileBranch).not.toContain("items-per-row-config-key");
    },
  );

  it.each(mobileMenuResourcePages)(
    "uses the trailing mobile menu placement for %s",
    (_name, relativePath) => {
      const mobileBranch = readMobileBranch(relativePath);

      expect(mobileBranch).toContain("show-menu-button");
      expect(mobileBranch).toContain("menu-button-placement=trailing");
    },
  );

  it.each(mobileIconOnlyImportPages)(
    "uses an icon-only mobile import action before the menu on %s",
    (_name, relativePath) => {
      const mobileBranch = readMobileBranch(relativePath);

      expect(mobileBranch).toContain("canImport");
      expect(mobileBranch).toContain("import-icon-only");
      expect(mobileBranch).toContain("menu-button-placement=trailing");
    },
  );

  it("renders catalog import icon controls between filter and trailing menu", () => {
    const catalogView = readFileSync(
      new URL(
        "../../src/components/catalogResourcesView/catalogResourcesView.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const filterIndex = catalogView.indexOf("tagFilterButton");
    const importIndex = catalogView.indexOf("showIconImportButton");
    const menuIndex = catalogView.indexOf("showTrailingMenuButton");

    expect(catalogView).toContain("rtgl-view#importBtn w=36 h=36");
    expect(filterIndex).toBeGreaterThan(-1);
    expect(importIndex).toBeGreaterThan(filterIndex);
    expect(importIndex).toBeLessThan(menuIndex);
  });

  it("aligns item surfaces with the navbar inset in shared resource views", () => {
    const sharedViews = [
      "mediaResourcesView/mediaResourcesView.view.yaml",
      "catalogResourcesView/catalogResourcesView.view.yaml",
      "textStyleResourcesView/textStyleResourcesView.view.yaml",
      "charactersResourcesView/charactersResourcesView.view.yaml",
      "groupVariablesView/groupVariablesView.view.yaml",
    ];

    for (const relativePath of sharedViews) {
      const view = readFileSync(
        new URL(`../../src/components/${relativePath}`, import.meta.url),
        "utf8",
      );

      expect(view).toContain("ph=md pos=rel");
      expect(view).not.toContain("rtgl-grid w=f ph=sm");
      expect(view).not.toContain("rtgl-view w=f d=v ph=sm");
      expect(view).not.toContain("rtgl-view w=f mb=md p=sm");
    }
  });
});
