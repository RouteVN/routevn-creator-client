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
    expect(systemActionsView).toContain(
      'rtgl-button#voicePreviewButton sq v=ol pre=play title="${previewVoiceLabel}" aria-label="${previewVoiceLabel}"',
    );
    expect(systemActionsView).not.toContain("$if preview.voice.fileId");
    expect(systemActionsView).toContain(
      "rvn-audio-player#rvnAudioPlayer fileId=${playingSound.fileId} autoPlay=true :title=${playingSound.title}",
    );
    expect(systemActionsView).toContain("rtgl-svg svg=screen wh=24");
    expect(systemActionsView).toContain(
      "preview.background.type == 'spritesheet'",
    );
    expect(systemActionsView).toContain(
      "fileId=${preview.background.spritesheetFileId}",
    );
    expect(systemActionsView).toContain(
      "visualData.resourceType == 'spritesheet'",
    );
    expect(systemActionsView).toContain(
      "fileId=${visualData.spritesheetFileId}",
    );
    expect(conditionalView).toContain(
      "rvn-system-actions#branchActionsEditor :showSelected=${true} :actions=${branchActions} actionType=system :hiddenModes=${hiddenModes} :allowedModes=${branchActionAllowedModes}",
    );
  });

  it("preserves scene editor selection before action dialog controls open", () => {
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

    expect(systemActionsView).toContain("mousedown:");
    expect(systemActionsView).toContain(
      "handler: handleActionControlMouseDown",
    );
    expect(sceneEditorLexicalView).toContain("actions-dialog-open:");
    expect(sceneEditorLexicalView).toContain(
      "handler: handleSystemActionsDialogOpen",
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
    expect(systemActionsView).toContain("overflow-x: hidden");
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

  it("lets the dialog surface activate mobile-safe dialog sizing", () => {
    const dialogSurfaceView = readFileSync(
      new URL(
        "../../src/components/systemActionsDialogSurface/systemActionsDialogSurface.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(dialogSurfaceView).toContain(
      "rtgl-dialog#dialog ?open=${open} s=${dialogSize}",
    );
    expect(dialogSurfaceView).toContain("overflow-x: hidden");
    expect(dialogSurfaceView).toContain("touch-action: pan-y");
  });
});
