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
    expect(view).toContain(
      "rtgl-text w=1fg s=lg fw=b: ${computedExamplesLabel}",
    );
    expect(view).toContain("rtgl-button#addComputedExampleButton sq");
    expect(view).not.toContain("?disabled=${computedExampleAddDisabled}");
    expect(view).toContain("rtgl-dialog#computedExampleDialog s=md");
    expect(view).toContain("rtgl-form#computedExampleForm");
    expect(view).not.toContain("removeComputedExampleButton${i}");
    expect(view).toContain("handler: handleComputedExampleContextMenu");
    expect(view).not.toContain("Computation mode");
    expect(view).not.toContain("computationModeControl");
    expect(view).not.toContain("computed-formula-editor");
    expect(view).not.toContain("computed-conditional-editor");
    expect(view).not.toContain("rvn-computed-variable-editor");
    expect(view).not.toContain("rvn-computed-conditional-editor");
    expect(view).not.toContain("addVariableDialog");
    expect(view).toContain("resourceImportAction:");
    expect(view).toContain("search-input:");
    expect(view).toContain("handler: handleSearchInput");
    expect(view).toContain("rvn-resource-import-action#resourceImportAction");
  });

  it("scrolls long computed forms through a constrained wrapper", () => {
    expect(view).toContain(
      'rtgl-view#computedFormScrollContainer w=1fg h=f sv ph=md style="grid-column: 1; grid-row: 1; min-width: 0; min-height: 0;"',
    );
    expect(view).toContain('rtgl-view slot="operation" d=v w=f g=sm pb=lg');
    expect(view).toContain(
      "rtgl-form#computedForm key=computed-${dialogKey} :defaultValues=${defaultValues} :form=${computedForm} :context=${context}",
    );
    expect(view).not.toContain(
      "rtgl-form#computedForm key=computed-${dialogKey} :defaultValues=${defaultValues} :form=${computedForm} w=1fg h=f",
    );
    expect(view).not.toContain(
      'rtgl-form#computedForm key=computed-${dialogKey} :defaultValues=${defaultValues} :form=${computedForm} :context=${context} style="min-width: 0; overflow-y: auto;"',
    );
  });

  it("keeps variable and computed submit actions visible below scrolling content", () => {
    expect(view).toContain('rtgl-view w=f h=1fg sv style="min-height: 0;"');
    expect(view).toContain(
      "rtgl-dialog#variableDialog s=md md-layout=fixed-top p=none",
    );
    expect(view).toContain(
      "rtgl-button#variableSubmitButton v=pr: ${variableSubmitLabel}",
    );
    expect(view).toContain(
      'rtgl-view class=computedDialogContent slot=content w=f h=70vh md-h=f pv=md style="display: grid; grid-template-columns: minmax(0, 1fr) 1px 280px; grid-template-rows: minmax(0, 1fr) auto; column-gap: var(--spacing-lg); min-width: 0; min-height: 0; overflow: hidden;"',
    );
    expect(view).toContain(
      'style="grid-column: 1; grid-row: 2; box-sizing: border-box;"',
    );
    expect(view).toContain(
      "rtgl-button#computedSubmitButton v=pr: ${computedSubmitLabel}",
    );
    expect(view).toContain("handler: handleVariableSubmitClick");
    expect(view).toContain("handler: handleVariableFormKeyDown");
    const variableFooter = view
      .split("\n")
      .find((line) => line.includes("grid-column: 1; grid-row: 2"));
    const computedFooter = view
      .split("\n")
      .find((line) => line.includes('style="grid-column: 1; grid-row: 2;'));

    expect(variableFooter).not.toContain("bwt=");
    expect(computedFooter).not.toContain("bwt=");
  });
});
