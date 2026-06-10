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
    expect(systemActionsView).toContain(
      "rvn-command-line-actions#commandLineActions :actionsType=${actionsType} :hiddenModes=${hiddenModes} :allowedModes=${allowedModes}",
    );
    expect(systemActionsView).toContain(
      "rvn-command-line-screen#commandLineScreen :screen=${actions.screen}",
    );
    expect(systemActionsView).toContain(
      "rvn-command-line-voice#commandLineVoice :voice=${actions.voice} currentSceneId=${currentSceneId}",
    );
    expect(systemActionsView).toContain("rtgl-view#actionItemVoice");
    expect(systemActionsView).toContain("rtgl-svg svg=microphone wh=24");
    expect(systemActionsView).toContain("rtgl-svg svg=screen wh=24");
    expect(conditionalView).toContain(
      "rvn-system-actions#branchActionsEditor :showSelected=${true} :actions=${branchActions} actionType=system :hiddenModes=${hiddenModes} :allowedModes=${branchActionAllowedModes}",
    );
  });

  it("uses a shared dialog surface with a scene-only left-docked variant", () => {
    const systemActionsView = readFileSync(
      new URL(
        "../../src/components/systemActions/systemActions.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const sceneEditorLexicalView = readFileSync(
      new URL(
        "../../src/pages/sceneEditorLexical/sceneEditorLexical.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(systemActionsView).toContain(
      "rvn-system-actions-dialog-surface#actionsDialog",
    );
    expect(systemActionsView).toContain(
      ":suppressClose=${suppressDialogClose}",
    );
    expect(sceneEditorLexicalView).toContain(
      "dialog-variant=scene-editor-left",
    );
    expect(systemActionsView).toContain(
      ":backgroundTransformEditor=${backgroundTransformEditor}",
    );
    expect(sceneEditorLexicalView).toContain(
      ":backgroundTransformEditor=${backgroundTransformEditor}",
    );
    expect(sceneEditorLexicalView).toContain(
      'dialog-panel-width="${systemActionsDialogPanelWidth}"',
    );
  });
});
