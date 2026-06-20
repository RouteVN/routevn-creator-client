import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("commandLineActions view", () => {
  it("keeps action chooser rows constrained to the available width", () => {
    const commandLineActionsView = readFileSync(
      new URL(
        "../../src/components/commandLineActions/commandLineActions.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const commandLineSystemActionsView = readFileSync(
      new URL(
        "../../src/components/commandLineSystemActions/commandLineSystemActions.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    for (const view of [commandLineActionsView, commandLineSystemActionsView]) {
      expect(view).toContain("box-sizing: border-box; overflow: hidden;");
      expect(view).toContain('style="min-width: 0; box-sizing: border-box;"');
      expect(view).toContain("rtgl-text s=sm w=1fg ellipsis=true");
    }
  });
});
