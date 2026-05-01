import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("systemActions view", () => {
  it("propagates hidden modes into conditional action editors", () => {
    const systemActionsView = readFileSync(
      new URL(
        "../../src/components/systemActions/systemActions.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const conditionalView = readFileSync(
      new URL(
        "../../src/components/commandLineConditional/commandLineConditional.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(systemActionsView).toContain(
      "rvn-command-line-conditional#commandLineConditional :conditional=${actions.conditional} :hiddenModes=${hiddenModes}",
    );
    expect(conditionalView).toContain(
      "rvn-system-actions#branchActionsEditor :showSelected=${true} :actions=${branchActions} actionType=system :hiddenModes=${hiddenModes}",
    );
  });
});
