import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mobileDetailSheetPages = [
  ["animations", "animations/animations.view.yaml"],
  ["character sprites", "characterSprites/characterSprites.view.yaml"],
  ["characters", "characters/characters.view.yaml"],
  ["colors", "colors/colors.view.yaml"],
  ["controls", "controls/controls.view.yaml"],
  ["fonts", "fonts/fonts.view.yaml"],
  ["images", "images/images.view.yaml"],
  ["layouts", "layouts/layouts.view.yaml"],
  ["particles", "particles/particles.view.yaml"],
  ["sounds", "sounds/sounds.view.yaml"],
  ["spritesheets", "spritesheets/spritesheets.view.yaml"],
  ["text styles", "textStyles/textStyles.view.yaml"],
  ["transforms", "transforms/transforms.view.yaml"],
  ["variables", "variables/variables.view.yaml"],
  ["versions", "versions/versions.view.yaml"],
  ["videos", "videos/videos.view.yaml"],
];

describe("mobile detail sheet header", () => {
  it.each(mobileDetailSheetPages)(
    "uses the compact header height for %s",
    (_name, relativePath) => {
      const view = readFileSync(
        new URL(`../../src/pages/${relativePath}`, import.meta.url),
        "utf8",
      );
      const mobileDetailSheetStart = view.indexOf("$if showMobileDetailSheet");
      const mobileDetailSheetBranch = view.slice(mobileDetailSheetStart);

      expect(mobileDetailSheetStart).toBeGreaterThan(-1);
      expect(mobileDetailSheetBranch).toContain(
        "rtgl-view#detailHeader h=36 w=f d=h",
      );
      expect(mobileDetailSheetBranch).not.toContain(
        "rtgl-view#detailHeader h=48 w=f d=h",
      );
    },
  );
});
