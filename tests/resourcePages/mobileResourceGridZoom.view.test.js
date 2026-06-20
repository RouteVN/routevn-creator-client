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
});
