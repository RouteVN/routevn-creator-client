import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("baseFileExplorer view", () => {
  it("renders bottom empty space as a native spacer with explicit height", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/baseFileExplorer/baseFileExplorer.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain("div#container");
    expect(view).toContain("height: ${bottomEmptySpaceHeight};");
    expect(view).toContain("flex: 0 0 ${bottomEmptySpaceHeight};");
    expect(view).not.toContain("rtgl-view#container w=f h=1fg");
  });
});
