import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("audio effects views", () => {
  it("wires catalog CRUD, tags, mobile detail, and editor navigation", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/audioEffects/audioEffects.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    for (const handler of [
      "handleAddAudioEffectClick",
      "handleAudioEffectItemEdit",
      "handleAudioEffectItemDoubleClick",
      "handleItemDuplicate",
      "handleItemDelete",
      "handleEditFormAction",
      "handleDetailTagValueChange",
      "handleFileExplorerTargetChanged",
    ]) {
      expect(view).toContain(`handler: ${handler}`);
    }
    expect(view).toContain("rvn-catalog-resources-view#groupview");
    expect(view).toContain("rtgl-button#mobileDetailOpenButton");
    expect(view).toContain("rtgl-dialog#editDialog");
    expect(view).toContain("rtgl-form#editForm");
    expect(view).toContain("md-layout=fixed-top:");
    expect(view).not.toContain("md-layout=fixed-top p=none");
    expect(view).toContain("slot=content d=v w=f h=f overflow=hidden");
    expect(view).toContain("rtgl-form#editForm");
    expect(view).toContain("w=f h=f");
    expect(view).not.toContain("rtgl-button#editSubmitButton");

    const catalogView = readFileSync(
      new URL(
        "../../src/components/catalogResourcesView/catalogResourcesView.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    expect(catalogView).toContain("$elif item.cardKind == 'animation'");
    expect(catalogView).toContain("${item.transitionPreviousLabel}");
    expect(catalogView).toContain("${item.transitionNextLabel}");
    expect(catalogView).toContain("rvn-keyframe-timeline");
  });

  it("keeps transition and update controls on their respective editor paths", () => {
    const view = readFileSync(
      new URL(
        "../../src/pages/audioEffectsEditor/audioEffectsEditor.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain("$if isTransition");
    expect(view).not.toContain("transitionForm");
    expect(view).toContain("rvn-keyframe-timeline#updateTimeline");
    expect(view).toContain("rvn-keyframe-timeline#transitionRuler");
    expect(view).toContain("rvn-keyframe-timeline#previousTimeline");
    expect(view).toContain("rvn-keyframe-timeline#nextTimeline");
    expect(view).toContain("handler: handleAddKeyframeFromTimeline");
    expect(view).toContain("handler: handleKeyframeDurationChange");
    expect(view).toContain("handler: handlePropertyNameClick");
    expect(view).toContain("rvn-resizable-panel#timelineDetailsPanel");
    expect(view).toContain("rvn-detail-view#selectedKeyframeDetails");
    expect(view).toContain("handler: handleSelectedKeyframeEditClick");
    expect(view).toContain("handler: handleSelectedKeyframeDelayChange");
    expect(view).not.toMatch(/#[^'"\s]*_/);
  });
});
