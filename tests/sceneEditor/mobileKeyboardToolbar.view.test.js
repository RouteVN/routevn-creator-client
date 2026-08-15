import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mobileKeyboardToolbar view", () => {
  it("renders the toolbar whether or not the keyboard is visible", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/mobileKeyboardToolbar/mobileKeyboardToolbar.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).not.toContain("$if isVisible:");
    expect(view).toContain("${toolbarPositionStyle}");
    expect(view).toContain("rtgl-view#toolbarItem${i}");
    expect(view).toContain("bgc=${item.bgColor} h-bgc=ac");
    expect(view).not.toContain("bgc=mu h-bgc=ac");
    expect(view).toContain("h=48 bgc=bg bwb=xs bc=bo");
    expect(view).not.toContain("h=48 bgc=bg bw=xs bc=bo");
  });
});
