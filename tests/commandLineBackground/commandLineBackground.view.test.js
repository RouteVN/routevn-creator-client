import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("commandLineBackground view", () => {
  it("uses the image resource-card dimensions for the empty placeholder", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/commandLineBackground/commandLineBackground.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).not.toContain("rtgl-view#backgroundImage w=355");
    expect(
      view.match(
        /rtgl-text s=xs c=mu-fg ellipsis w=f: \$\{selectBackgroundLabel\}/g,
      ),
    ).toHaveLength(2);
    expect(
      view.match(
        /rtgl-view br=md w=200 pos=rel overflow=hidden style="max-width: 100%; box-sizing: border-box;"/g,
      ).length,
    ).toBe(2);
    expect(view).toContain(
      'rtgl-view br=md w=200 pos=rel overflow=hidden style="${selectedResource.resourceCardStyle}"',
    );
    expect(view).toContain(":columns=${imageSelectorColumns}");
    expect(view).toContain(
      'rtgl-view w=1fg sh style="min-width: 0; overscroll-behavior-x: contain;"',
    );
    expect(view).toContain(
      'rtgl-tabs#tabs selected-tab=${tab} :items=${tabs} style="display: block; min-width: max-content;"',
    );
    expect(view).toContain("$if showInlineSearch:");
    expect(view).toContain("$if showSearchButton:");
    expect(view).toContain(
      'rtgl-button#searchButton sq pre=search v=ol aria-label="${searchButtonLabel}"',
    );
    expect(view).toContain(
      "rtgl-popover#searchPopover ?open=${searchPopover.isOpen}",
    );
    expect(view).toContain(
      'rtgl-view d=h av=c ah=e w=f g=lg ph=md pt=sm style="flex: 0 0 auto;"',
    );
    expect(view).toContain("w=f h=f pv=md");
    expect(view).toContain("rtgl-view w=f h=24 av=c ph=md mb=md:");
  });
});
