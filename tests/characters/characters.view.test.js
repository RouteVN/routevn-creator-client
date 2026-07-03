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
      "rtgl-view#mobileFileExplorerClose w=40 h=40 bw=xs br=md ah=c av=c cur=pointer bgc=bg bc=bo",
    );
    expect(mobileExplorerBranch).not.toContain("rtgl-view h=56 w=f d=h");
  });
});
