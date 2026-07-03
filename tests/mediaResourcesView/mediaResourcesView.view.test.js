import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mediaResourcesView view", () => {
  it("renders the optional back action as a bordered navbar icon", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/mediaResourcesView/mediaResourcesView.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain(
      "rtgl-view#backButton w=36 h=36 bw=xs br=md ah=c av=c cur=pointer bgc=bg bc=bo",
    );
    expect(view).toContain("rtgl-svg svg=chevronLeft wh=16 c=mu-fg");
    expect(view).not.toContain(
      'rtgl-button#backButton sq pre="chevronLeft" v="gh"',
    );
  });
});
