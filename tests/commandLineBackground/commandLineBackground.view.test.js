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
  });
});
