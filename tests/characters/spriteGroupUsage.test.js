import { describe, expect, it } from "vitest";
import { buildSpriteGroupInUseMessage } from "../../src/pages/characters/support/spriteGroupUsage.js";
import { EN_I18N, FR_I18N } from "../support/i18n.js";

const usage = { sceneName: "Prologue", sectionName: "Arrival" };

describe("buildSpriteGroupInUseMessage", () => {
  it("names the scene and the section with one catalog template", () => {
    expect(
      buildSpriteGroupInUseMessage({
        spriteGroupName: "Faces",
        usage,
        copy: EN_I18N.charactersPage,
      }),
    ).toBe(
      'Sprite group "Faces" is used in scene "Prologue", section "Arrival" and can\'t be removed. Remove it from those lines first.',
    );
    expect(
      buildSpriteGroupInUseMessage({
        spriteGroupName: "Faces",
        usage,
        copy: FR_I18N.charactersPage,
      }),
    ).toContain("dans la section « Arrival » de la scène « Prologue »");
  });
});
