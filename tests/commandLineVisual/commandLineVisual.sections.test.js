import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setAnimations,
  setExistingVisuals,
  setImages,
} from "../../src/components/commandLineVisual/commandLineVisual.store.js";
import { EN_I18N, JA_I18N } from "../support/i18n.js";

describe("commandLineVisual sections", () => {
  it("creates a named form section with two-column rows for each visual", () => {
    const state = createInitialState();
    setImages(
      { state },
      {
        images: {
          items: {
            "visual-one": {
              id: "visual-one",
              type: "image",
              name: "Visual One",
              fileId: "file-one",
            },
          },
          tree: [{ id: "visual-one" }],
        },
      },
    );
    setAnimations(
      { state },
      {
        animations: {
          items: {
            fade: {
              id: "fade",
              type: "animation",
              name: "Fade",
              animation: { type: "update" },
            },
          },
          tree: [{ id: "fade" }],
        },
      },
    );
    setExistingVisuals(
      { state },
      {
        visuals: [
          {
            id: "visual-item-one",
            resourceId: "visual-one",
            resourceType: "image",
            layer: 50,
            opacity: 0.75,
            blur: {
              x: 4,
              y: 6,
              quality: 2,
              kernelSize: 5,
              repeatEdgePixels: false,
            },
            animations: { resourceId: "fade" },
          },
        ],
      },
    );

    const viewData = selectViewData({ state, i18n: EN_I18N });
    const [section] = viewData.form.fields;
    const rows = section.fields.map((field) =>
      field.type === "row"
        ? field.fields.map((nestedField) => nestedField.slot)
        : field.slot,
    );

    expect(section).toMatchObject({
      type: "section",
      id: "visual-0",
      label: "Visual One",
    });
    expect(rows).toEqual([
      ["visual-0-preview", "visual-0-layer"],
      ["visual-0-transform-mode", "visual-0-predefined-transform"],
      "visual-0-animation",
      ["visual-0-playback-speed", "visual-0-playback-continuity"],
      ["visual-0-playback-loop", "visual-0-playback-loop-spacer"],
      ["visual-0-opacity", "visual-0-blur-toggle"],
      ["visual-0-blur-x", "visual-0-blur-y"],
      ["visual-0-blur-quality", "visual-0-blur-kernel-size"],
      "visual-0-blur-repeat-edge-pixels",
    ]);
    expect(viewData.defaultValues.visuals[0]).toMatchObject({
      controlId: "0x0",
      previewFormSlot: "visual-0-preview",
      layerFormSlot: "visual-0-layer",
    });
    expect(viewData.formKey).toBe(
      "0:visual-item-one:Visual One:50:preset-transform:fade:update:blur",
    );
  });

  it("renders the visual controls through their matching form slots", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/commandLineVisual/commandLineVisual.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain("rtgl-form#form key=${formKey}");
    expect(view).toContain("slot=${visual.previewFormSlot}");
    expect(view).toContain("slot=${visual.layerFormSlot}");
    expect(view).toContain("slot=${visual.transformModeFormSlot}");
    expect(view).toContain("slot=${visual.predefinedTransformFormSlot}");
    expect(view).toContain("slot=${visual.customTransformFormSlot}");
    expect(view).toContain("slot=${visual.animationFormSlot}");
    expect(view).toContain("slot=${visual.playbackSpeedFormSlot}");
    expect(view).toContain("slot=${visual.playbackContinuityFormSlot}");
    expect(view).toContain("slot=${visual.opacityFormSlot}");
    expect(view).toContain("slot=${visual.blurToggleFormSlot}");
    expect(view).toContain("slot=${visual.blurXFormSlot}");
    expect(view).toContain("slot=${visual.blurYFormSlot}");
    expect(view).toContain("slot=${visual.blurQualityFormSlot}");
    expect(view).toContain("slot=${visual.blurKernelSizeFormSlot}");
    expect(view).toContain("slot=${visual.blurRepeatEdgePixelsFormSlot}");
    expect(view).toContain("handler: handleCustomTransformButtonKeyDown");
    expect(view).toContain(
      'data-target-name="${visual.displayName}" role=button tabindex=0',
    );
    expect(view).toContain("rtgl-grid cols=2 g=md w=f:");
    expect(view).not.toContain("backgroundTransformEditor");
  });

  it("preserves user-authored visual names while localizing static labels", () => {
    const state = createInitialState();
    setImages(
      { state },
      {
        images: {
          items: {
            "visual-one": {
              id: "visual-one",
              type: "image",
              name: "Visuals",
              fileId: "file-one",
            },
          },
          tree: [{ id: "visual-one" }],
        },
      },
    );
    setExistingVisuals(
      { state },
      {
        visuals: [
          {
            id: "visual-item-one",
            resourceId: "visual-one",
            resourceType: "image",
          },
        ],
      },
    );

    const [section] = selectViewData({ state, i18n: JA_I18N }).form.fields;

    expect(section.label).toBe("Visuals");
    expect(section.fields[0].fields[0].label).toBe("表示素材");
  });
});
