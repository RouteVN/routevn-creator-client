import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("animationEditor view", () => {
  it("uses an outline navbar icon button for the back action", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/animationEditor/animationEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain("rtgl-button#backButton sq pre=chevronLeft v=ol");
    expect(view).not.toContain(
      'rtgl-button#backButton sq pre="chevronLeft" v="gh"',
    );
  });

  it("uses dialogs on touch for add-property and keyframe forms", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/animationEditor/animationEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain("$if showAddPropertyPopover");
    expect(view).toContain("$if showAddKeyframePopover");
    expect(view).toContain("$if showEditKeyframePopover");
    expect(view).toContain("rtgl-dialog#addPropertyDialog");
    expect(view).toContain("rtgl-dialog#addKeyframeDialog");
    expect(view).toContain("rtgl-dialog#editKeyframeDialog");
    expect(view).toContain("?open=${showAddPropertyDialog}");
    expect(view).toContain("?open=${showAddKeyframeDialog}");
    expect(view).toContain("?open=${showEditKeyframeDialog}");
    expect(view).not.toContain("$if popover.mode == 'addProperty'");
    expect(view).not.toContain("$if popover.mode == 'addKeyframe'");
    expect(view).not.toContain("$if popover.mode == 'editKeyframe'");
  });

  it("keeps the mask image selector compact with a fixed preview ratio", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/animationEditor/animationEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    const selectorStart = view.indexOf("$if maskEditorPanel.singleImage");
    const selectorEnd = view.indexOf(
      "rtgl-text s=sm c=mu-fg: ${progressDurationLabel}",
      selectorStart,
    );
    const selectorBranch = view.slice(selectorStart, selectorEnd);

    expect(
      selectorBranch.match(/rtgl-view#singleMaskImageButton w=160/g),
    ).toHaveLength(2);
    expect(selectorBranch.match(/aspect-ratio: 16 \/ 9;/g)).toHaveLength(2);
    expect(selectorBranch).toContain("max-width: 100%;");
    expect(selectorBranch).not.toContain("singleMaskImageButton w=f");
    expect(selectorBranch).not.toContain("h=120");
    expect(selectorBranch).not.toContain("h=96");
  });
});
