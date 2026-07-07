import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("characters view", () => {
  it("uses the same mobile file explorer navbar sizing as images", () => {
    const charactersView = readFileSync(
      new URL(
        "../../src/pages/characters/characters.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    const mobileExplorerStart = charactersView.indexOf(
      "$if showMobileFileExplorer",
    );
    const mobileDetailSheetStart = charactersView.indexOf(
      "$if showMobileDetailSheet",
      mobileExplorerStart,
    );
    const mobileExplorerBranch = charactersView.slice(
      mobileExplorerStart,
      mobileDetailSheetStart,
    );

    expect(mobileExplorerBranch).toContain(
      "rtgl-view h=48 w=f d=h av=c ph=md bgc=bg bwb=xs g=md",
    );
    expect(mobileExplorerBranch).toContain(
      "rtgl-button#mobileFileExplorerClose sq pre=x v=ol",
    );
    expect(mobileExplorerBranch).not.toContain("rtgl-view h=56 w=f d=h");
  });

  it("uses a sprites label for the mobile action sheet button", () => {
    const charactersView = readFileSync(
      new URL(
        "../../src/pages/characters/characters.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(charactersView).toContain(
      "rtgl-button#mobileDetailSpritesButton w=1fg v=se pre=image: ${spritesButtonLabel}",
    );
    expect(charactersView).not.toContain(
      "rtgl-button#mobileDetailSpritesButton w=1fg v=se pre=image: ${spriteGroupsLabel}",
    );
  });
});
