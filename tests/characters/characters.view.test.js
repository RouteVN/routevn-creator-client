import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("characters view", () => {
  it("uses command-line-style fixed-top dialog scrolling and actions", () => {
    const charactersView = readFileSync(
      new URL(
        "../../src/pages/characters/characters.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(charactersView).toContain(
      "rtgl-dialog#addCharacterDialog ?open=${isDialogOpen} s=md md-layout=fixed-top p=none:",
    );
    expect(charactersView).toContain(
      "rtgl-dialog#editDialog ?open=${isEditDialogOpen} s=md md-layout=fixed-top p=none:",
    );
    expect(
      charactersView.match(
        /slot=content w=f h=f pv=md pos=rel style="min-width: 0; min-height: 0; overflow: hidden;"/g,
      ),
    ).toHaveLength(2);
    expect(charactersView).toContain(
      "rtgl-form#characterForm key=${isDialogOpen} :defaultValues=${dialogDefaultValues} :form=${dialogForm} w=f ph=md:",
    );
    expect(charactersView).toContain(
      "rtgl-form#editForm key=${isEditDialogOpen} :defaultValues=${editDefaultValues} :form=${editForm} w=f ph=md:",
    );
    expect(
      charactersView.match(/rtgl-view h=1fg sv w=f style="min-height: 0;"/g),
    ).toHaveLength(2);
    expect(
      charactersView.match(
        /rtgl-view h=80 aria-hidden=true style="flex: 0 0 80px;"/g,
      ),
    ).toHaveLength(2);
    expect(
      charactersView.match(
        /rtgl-view d=h av=c ah=e w=f g=lg ph=md pt=md style="flex: 0 0 auto;"/g,
      ),
    ).toHaveLength(2);
    expect(charactersView).toContain(
      "rtgl-button#addCharacterSubmitButton v=pr: ${addCharacterButtonLabel}",
    );
    expect(charactersView).toContain(
      "rtgl-button#editCharacterSubmitButton v=pr: ${updateCharacterButtonLabel}",
    );
    expect(charactersView).not.toContain('layout="fixed"');
  });

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
