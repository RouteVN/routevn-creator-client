import { describe, expect, it, vi } from "vitest";
import { handleFuriganaDialogRequest } from "../../src/components/sceneDocumentEditorLexical/sceneDocumentEditorLexical.handlers.js";
import { FR_I18N } from "../support/i18n.js";

describe("sceneDocumentEditorLexical ruby text dialog", () => {
  it("labels its buttons in the app's language and keeps a text style chosen", async () => {
    const showFormDialog = vi.fn(async () => undefined);
    const deps = {
      appService: { showFormDialog, showAlert: vi.fn() },
      refs: { editor: { clearPendingRichTextSelection: vi.fn() } },
      i18n: FR_I18N,
    };

    await handleFuriganaDialogRequest(deps, {
      _event: {
        detail: { textStyles: [{ id: "style-ruby", name: "Ruby" }] },
      },
    });

    const { form, defaultValues } = showFormDialog.mock.calls[0][0];
    expect(form.actions.buttons.map((button) => button.label)).toEqual([
      "Annuler",
      "Valider",
    ]);
    expect(
      form.fields.find((field) => field.name === "textStyleId"),
    ).toMatchObject({ clearable: false });
    expect(defaultValues.textStyleId).toBe("style-ruby");
  });
});
