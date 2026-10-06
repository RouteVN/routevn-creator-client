import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync(
  new URL("../../src/pages/textStyles/textStyles.view.yaml", import.meta.url),
  "utf8",
);

describe("textStyles view", () => {
  it("adds text styles and edits their name, description and tags in dialogs", () => {
    expect(view).toContain(
      "rtgl-form#addForm key=${isAddDialogOpen} :defaultValues=${addFormDefaults} :form=${addForm}",
    );
    expect(view).toContain(
      "rtgl-form#editForm key=${isEditDialogOpen} :defaultValues=${editDefaultValues} :form=${editForm}",
    );
    // How a text style looks is edited on the text style editor page.
    for (const removed of [
      "addTypographyDialog",
      "textStyleForm",
      "previewTextInput",
      "addColorDialog",
      "addFontDialog",
      "mode=live",
    ]) {
      expect(view).not.toContain(removed);
    }
  });

  it("previews the selected text style in the desktop detail panel and opens it from there", () => {
    expect(view.match(/rvn-font-preview mode=thumbnail /g)).toHaveLength(1);
    expect(view).toContain(
      'rtgl-view#detailTextStylePreview slot="text-style-preview"',
    );
    expect(view).toContain(
      "detailTextStylePreview:\n    eventListeners:\n      click:\n        handler: handleDetailPreviewClick",
    );
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
    expect(sheet).not.toContain("mobileDetailEditButton");
  });

  it("opens and duplicates from the center menu", () => {
    for (const listener of [
      "item-edit:\n        handler: handleTextStyleItemEdit",
      "item-duplicate:\n        handler: handleItemDuplicate",
      "item-dblclick:\n        handler: handleTextStyleItemDoubleClick",
    ]) {
      expect(view).toContain(listener);
    }
  });
});
