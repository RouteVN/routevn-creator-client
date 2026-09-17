import { expect, it, vi } from "vitest";
import * as characters from "../../src/pages/characters/characters.store.js";
import { handleEditFormAction } from "../../src/pages/characters/characters.handlers.js";
import { EN_I18N } from "../support/i18n.js";

it.each([
  { mode: "touch", shortcut: undefined },
  { mode: "mouse", shortcut: undefined },
  { mode: "mouse", shortcut: "" },
  { mode: "mouse", shortcut: "3" },
])(
  "handles $mode editing with shortcut $shortcut without clearing hidden data",
  async ({ mode, shortcut }) => {
    const state = characters.createInitialState();
    const context = { state, i18n: EN_I18N };
    const item = {
      id: "character-one",
      type: "character",
      name: "Character One",
      description: "",
      shortcut: "6",
      tagIds: [],
      spriteGroups: [],
    };
    characters.setItems(context, {
      charactersData: { items: { [item.id]: item }, tree: [{ id: item.id }] },
    });
    characters.setUiConfig(context, { uiConfig: { inputMode: mode } });
    characters.setSelectedItemId(context, { itemId: item.id });
    characters.openEditDialog(context, { itemId: item.id, spriteGroups: [] });
    const view = characters.selectViewData(context);
    const hasShortcut = mode === "mouse";
    for (const form of [view.dialogForm, view.editForm]) {
      expect(form.fields.some((field) => field.name === "shortcut")).toBe(
        hasShortcut,
      );
    }
    expect(view.detailFields.some((field) => field.label === "Shortcut")).toBe(
      hasShortcut,
    );
    if (!hasShortcut) {
      expect(
        view.mobileDetailFields.some((field) => field.label === "Shortcut"),
      ).toBe(false);
    }
    const fieldNames = new Set(view.editForm.fields.map((field) => field.name));
    const values = Object.fromEntries(
      Object.entries(view.editDefaultValues).filter(([name]) =>
        fieldNames.has(name),
      ),
    );
    if (hasShortcut && shortcut !== undefined) {
      values.shortcut = shortcut;
    } else {
      // Cleared selects and hidden fields are omitted from form submissions.
      delete values.shortcut;
    }
    values.name = "Character Two";
    const updateCharacter = vi.fn(async () => ({ valid: true }));
    const store = Object.fromEntries(
      Object.entries(characters).map(([name, fn]) => [
        name,
        (payload) => fn(context, payload),
      ]),
    );
    await handleEditFormAction(
      {
        i18n: EN_I18N,
        store,
        render: vi.fn(),
        refs: {},
        appService: { showAlert: vi.fn(), showToast: vi.fn() },
        projectService: {
          updateCharacter,
          getRepositoryState: () => ({
            characters: state.charactersData,
            tags: {},
            variables: state.variablesData,
          }),
        },
      },
      { _event: { detail: { actionId: "submit", values } } },
    );
    expect(updateCharacter).toHaveBeenCalledOnce();
    const { data } = updateCharacter.mock.calls[0][0];
    expect(data.name).toBe("Character Two");
    if (hasShortcut) {
      expect(data.shortcut).toBe(shortcut ?? "");
    } else {
      // Character updates are partial; omitting this field preserves the saved shortcut.
      expect(data).not.toHaveProperty("shortcut");
    }
  },
);
