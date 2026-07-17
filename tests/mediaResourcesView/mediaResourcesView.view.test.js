import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mediaResourcesView view", () => {
  it("renders the optional back action as an outline navbar icon", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/mediaResourcesView/mediaResourcesView.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain(
      'rtgl-button#backButton sq pre=chevronLeft v=ol aria-label="${backButtonLabel}" title="${backButtonLabel}"',
    );
  });

  it("places filter and zoom popovers below and left-aligned to their buttons", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/mediaResourcesView/mediaResourcesView.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain("rtgl-popover#tagFilterPopover");
    expect(view).toContain("rtgl-popover#zoomPopover");
    expect(view.match(/place=be/g)).toHaveLength(2);
  });
});
