import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("commandLineConditional view", () => {
  it("uses the numeric input primitive for number condition values", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/commandLineConditional/commandLineConditional.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain("rtgl-input-number#valueInput");
    expect(view).not.toContain("rtgl-input#valueInput type=number");
    expect(view).toContain(
      "rtgl-input-number#oneOfValueInput${i} data-index=${i} w=f",
    );
    expect(view).toContain("rtgl-view w=1fg");
    expect(view).toContain("pre=x");
    expect(view).toContain('style="${oneOfRemoveButtonStyle}"');
    expect(view).not.toContain("pre=trash");
    expect(view).toContain("handler: handleAddOneOfValueClick");
    expect(view).toContain("handler: handleRemoveOneOfValueClick");
    expect(view).toContain("handler: handleBranchMenuButtonClick");
    expect(view).toContain("handler: handleBranchMenuButtonKeyDown");
    expect(view).toContain("rtgl-button#branchMenuButton${i}");
    expect(view).toContain("aria-haspopup=menu");
    expect(view).toContain('aria-keyshortcuts="${branch.menuKeyShortcuts}"');
  });
});
