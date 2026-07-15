import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("sceneEditorLexical view", () => {
  it("renders the project-language text count in the editor toolbar", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/sceneEditorLexical/sceneEditorLexical.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain(
      'rtgl-text#sceneTextStats s=xs c=mu-fg style="white-space: nowrap;"',
    );
    expect(view).toContain("${sceneTextStatsLabel}");
  });
});
