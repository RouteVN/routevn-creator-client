import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";

const view = readFileSync(
  new URL(
    "../../src/components/groupVariablesView/groupVariablesView.view.yaml",
    import.meta.url,
  ),
  "utf8",
);

describe("groupVariablesView view", () => {
  it("parses and keeps stored and computed dialogs separate", () => {
    expect(() => yaml.load(view)).not.toThrow();
    expect(view).toContain("rtgl-dialog#variableDialog");
    expect(view).toContain("rtgl-dialog#computedDialog");
    expect(view).toContain("rtgl-form#variableForm");
    expect(view).toContain("rtgl-form#computedForm");
    expect(view).toContain('slot="operation"');
    expect(view).toContain("$if !operationBlock:");
    expect(view).toContain("rtgl-button#addOperationButton");
    expect(view).toContain(
      "rvn-computed-operation-block#computedOperationBlock :operation=${operationBlock}",
    );
    expect(view).toContain("rtgl-dropdown-menu#operationBlockMenu");
    expect(view).toContain("rtgl-dropdown-menu#operationChoiceMenu");
    expect(view).toContain("rtgl-dropdown-menu#operandSourceMenu");
    expect(view).not.toContain("rtgl-dropdown-menu#operationVariableMenu");
    expect(view).toContain(
      "rvn-computed-value-operand-popover#operationValuePopover",
    );
    expect(view).not.toContain("rtgl-input-number#operationValue${i}");
    expect(view).not.toContain("rtgl-select#operationVariable${i}");
    expect(view).not.toContain("pre=trash");
    expect(view).not.toContain("Computation mode");
    expect(view).not.toContain("computationModeControl");
    expect(view).not.toContain("computed-formula-editor");
    expect(view).not.toContain("computed-conditional-editor");
    expect(view).not.toContain("rvn-computed-variable-editor");
    expect(view).not.toContain("rvn-computed-conditional-editor");
    expect(view).not.toContain("addVariableDialog");
  });
});
