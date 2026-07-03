import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mobileFileExplorerPages = [
  ["animations", "animations/animations.view.yaml", "$if showMobileFileExplorer"],
  [
    "character sprites",
    "characterSprites/characterSprites.view.yaml",
    "$if showMobileFileExplorer",
  ],
  ["characters", "characters/characters.view.yaml", "$if showMobileFileExplorer"],
  ["colors", "colors/colors.view.yaml", "$if showMobileFileExplorer"],
  ["controls", "controls/controls.view.yaml", "$if showMobileFileExplorer"],
  ["fonts", "fonts/fonts.view.yaml", "$if showMobileFileExplorer"],
  ["images", "images/images.view.yaml", "$if showMobileFileExplorer"],
  [
    "layout editor",
    "layoutEditor/layoutEditor.view.yaml",
    "$if showMobileNodeExplorer",
  ],
  ["layouts", "layouts/layouts.view.yaml", "$if showMobileFileExplorer"],
  ["particles", "particles/particles.view.yaml", "$if showMobileFileExplorer"],
  ["sounds", "sounds/sounds.view.yaml", "$if showMobileFileExplorer"],
  ["spritesheets", "spritesheets/spritesheets.view.yaml", "$if showMobileFileExplorer"],
  ["text styles", "textStyles/textStyles.view.yaml", "$if showMobileFileExplorer"],
  ["transforms", "transforms/transforms.view.yaml", "$if showMobileFileExplorer"],
  ["variables", "variables/variables.view.yaml", "$if showMobileFileExplorer"],
  ["videos", "videos/videos.view.yaml", "$if showMobileFileExplorer"],
];

describe("mobile file explorer navbar", () => {
  it.each(mobileFileExplorerPages)(
    "matches the images navbar style for %s",
    (_name, relativePath, explorerCondition) => {
      const view = readFileSync(
        new URL(`../../src/pages/${relativePath}`, import.meta.url),
        "utf8",
      );

      expect(view).toContain(explorerCondition);
      expect(view).toContain(
        "rtgl-view h=48 w=f d=h av=c ph=md bgc=bg bwb=xs g=md",
      );
      expect(view).toContain(
        "rtgl-view#mobileFileExplorerClose w=40 h=40 bw=xs br=md ah=c av=c cur=pointer bgc=bg bc=bo",
      );
      expect(view).not.toContain(
        "rtgl-view h=56 w=f d=h av=c ph=md bgc=bg bwb=xs g=md",
      );
    },
  );
});
