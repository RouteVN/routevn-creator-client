import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setItems,
  setSelectedItemId,
} from "../../src/pages/controls/controls.store.js";
import { EN_I18N, PT_I18N } from "../support/i18n.js";

const createState = () => {
  const state = createInitialState();
  setItems(
    { state },
    {
      data: {
        items: {
          "control-1": {
            id: "control-1",
            type: "control",
            name: "Control One",
            keyboard: {
              enter: {
                payload: {
                  actions: {
                    rollbackByOffset: { offset: -1 },
                    conditional: { branches: [] },
                  },
                },
              },
              space: {
                payload: {
                  actions: {
                    saveSlot: {},
                    loadSlot: {},
                  },
                },
              },
              esc: {
                payload: {
                  actions: {
                    showConfirmDialog: {},
                    hideConfirmDialog: {},
                  },
                },
              },
            },
          },
        },
        tree: [{ id: "control-1" }],
      },
    },
  );
  setSelectedItemId({ state }, { itemId: "control-1" });
  return state;
};

const getActionLabels = (i18n) =>
  Object.fromEntries(
    selectViewData({
      state: createState(),
      props: {},
      i18n,
    }).keydownKeyboardItems.map((item) => [item.key, item.actionLabel]),
  );

describe("controls.store", () => {
  it("names every keyboard action, not by its id", () => {
    expect(getActionLabels(EN_I18N)).toEqual({
      enter: "Rollback, Conditional",
      space: "Save Slot, Load Slot",
      esc: "Show Confirm Dialog, Hide Confirm Dialog",
    });
    expect(getActionLabels(PT_I18N)).toEqual({
      enter: "Retroceder, Condicional",
      space: "Guardar no slot, Carregar do slot",
      esc: "Mostrar janela de confirmação, Ocultar janela de confirmação",
    });
  });
});
