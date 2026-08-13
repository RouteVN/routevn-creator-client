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

  it.each(mobileMenuResourcePages)(
    "uses a trash icon for the mobile delete action on %s",
    (_name, relativePath) => {
      const view = readFileSync(
        new URL(`../../src/pages/${relativePath}`, import.meta.url),
        "utf8",
      );

      expect(view).toContain(
        "rtgl-button#mobileDetailDeleteButton w=1fg v=se pre=trash: ${deleteButton}",
      );
    },
  );

  it("renders the shared import action in every resource header", () => {
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
      const importIndex = view.indexOf("- rvn-resource-import-action");
      const filterIndex = view.lastIndexOf("$if showTagFilter", importIndex);
      const menuIndex = view.indexOf("$if showTrailingMenuButton", importIndex);

      expect(importIndex).toBeGreaterThan(filterIndex);
      expect(importIndex).toBeLessThan(menuIndex);
    }
  });

  it("uses a narrow webkit scrollbar on the shared media scroll container", () => {
    const mediaView = readFileSync(
      new URL(
        "../../src/components/mediaResourcesView/mediaResourcesView.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(mediaView).toContain("#scrollContainer::-webkit-scrollbar");
    expect(mediaView).toContain("width: 1px");
    expect(mediaView).toContain("height: 1px");
  });

  it("uses normal horizontal item surface inset in shared resource views", () => {
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
      expect(view).not.toContain("pl=md pos=rel");
      expect(view).not.toContain("rtgl-grid w=f ph=sm");
      expect(view).not.toContain("rtgl-view w=f d=v ph=sm");
      expect(view).not.toContain("rtgl-view w=f mb=md p=sm");
    }
  });
});
