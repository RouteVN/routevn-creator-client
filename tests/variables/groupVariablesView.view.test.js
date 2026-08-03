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
    expect(view).toContain("rtgl-dialog#variableDialog s=md");
    expect(view).toContain("rtgl-dialog#computedDialog s=lg");
    expect(view).not.toContain("rtgl-dialog#variableDialog s=lg");
    expect(view).toContain("rtgl-form#variableForm");
    expect(view).toContain("rtgl-form#computedForm");
    expect(view).toContain('slot="operation"');
    expect(view).toContain("rtgl-button#addOperationButton v=se pre=plus w=f");
    expect(view).not.toContain("rtgl-button#addOperationButton sq");
    expect(view).not.toContain("${operationEmptyMessage}");
    expect(view).toContain(
      "rvn-computed-operation-block#computedOperationBlock :operation=${operationBlock}",
    );
    expect(view).toContain("$elif conditionalBuilder:");
    expect(view).toContain(
      "rtgl-view d=v w=f g=md bw=xs bc=bo br=md p=md bgc=bg",
    );
    expect(view).toContain("$for branch, i in conditionalBuilder.branches:");
    expect(view).toContain("addConditionalNodeCondition");
    expect(view).toContain("addConditionalNodeResult");
    expect(view).toContain("addConditionalNodeDefault");
    expect(view).toContain(
      "rtgl-view#conditionalVariableDefault data-target-kind=default",
    );
    expect(view).toContain("conditionalVariable*:");
    expect(view).toContain("conditionalValue*:");
    expect(view).toContain("handler: handleConditionalValueClick");
    expect(view).toContain(
      "rtgl-view#conditionalValueDefault data-target-kind=default",
    );
    expect(view).toContain(
      "rtgl-view#conditionalValueCondition${i} data-target-kind=condition",
    );
    expect(view).toContain(
      "data-target-kind=condition data-branch-index=${branch.branchIndex} w=1fg bw=xs bc=bo br=md p=sm cur=pointer",
    );
    expect(view).toContain(
      "rtgl-view#conditionalValueDefault data-target-kind=default w=1fg bw=xs bc=bo br=md p=sm cur=pointer",
    );
    expect(view).not.toContain("removeConditionalNodeCondition");
    expect(view).not.toContain("removeConditionalNodeResult");
    expect(view).not.toContain("removeConditionalNodeDefault");
    expect(view).toContain("addConditionalBranchButton");
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
