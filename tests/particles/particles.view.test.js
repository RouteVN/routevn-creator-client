import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync(
  new URL("../../src/pages/particles/particles.view.yaml", import.meta.url),
  "utf8",
);

describe("particles view", () => {
  it("adds particles and edits their name, description and tags in dialogs", () => {
    expect(view).toContain(
      "rtgl-form#addForm key=${isAddDialogOpen} :defaultValues=${addFormDefaults} :form=${addForm}",
    );
    expect(view).toContain(
      "rtgl-form#editForm key=${isEditDialogOpen} :defaultValues=${editDefaultValues} :form=${editForm}",
    );
    // The effect is edited on the particle editor page.
    expect(view).not.toContain("particleDialog");
    expect(view).not.toContain("dialogCanvas");
    expect(view).not.toContain("previewImageSelectorDialog");
  });

  it("plays the selected particle in the desktop detail panel", () => {
    expect(view.match(/div#detailCanvas /g)).toHaveLength(1);
    expect(view).toContain('rtgl-view slot="particle-preview"');
  });

  it("opens, duplicates and deletes from the phone detail sheet", () => {
    const sheet = view.slice(
      view.indexOf("rvn-mobile-sheet#mobileDetailSheet"),
    );

    expect(sheet).toContain(
      "rtgl-button#mobileDetailOpenButton w=1fg v=se pre=chevronRight: ${openButton}",
    );
    expect(sheet).toContain(
      "rtgl-button#mobileDetailDuplicateButton w=1fg v=se pre=duplicate: ${duplicateButton}",
    );
    expect(sheet).toContain(
      "rtgl-button#mobileDetailDeleteButton w=1fg v=se pre=trash: ${deleteButton}",
    );
    expect(sheet).not.toContain("mobileDetailPreviewButton");
  });

  it("opens and duplicates from the center menu", () => {
    for (const listener of [
      "item-edit:\n        handler: handleParticleItemEdit",
      "item-duplicate:\n        handler: handleItemDuplicate",
      "item-dblclick:\n        handler: handleParticleItemDoubleClick",
    ]) {
      expect(view).toContain(listener);
    }
  });
});
