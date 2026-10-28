import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { EN_I18N, JA_I18N } from "../support/i18n.js";
import * as saveSlotStore from "../../src/components/commandLineSaveSlot/commandLineSaveSlot.store.js";
import * as loadSlotStore from "../../src/components/commandLineLoadSlot/commandLineLoadSlot.store.js";
import { handleSubmitClick as handleSaveSlotSubmitClick } from "../../src/components/commandLineSaveSlot/commandLineSaveSlot.handlers.js";
import { handleSubmitClick as handleLoadSlotSubmitClick } from "../../src/components/commandLineLoadSlot/commandLineLoadSlot.handlers.js";

const AUTO_SLOT_MESSAGE =
  "Auto only works inside a Save/Load Slot container. Enter a slot id.";

const slotActions = [
  {
    actionName: "saveSlot",
    storeModule: saveSlotStore,
    handleSubmitClick: handleSaveSlotSubmitClick,
  },
  {
    actionName: "loadSlot",
    storeModule: loadSlotStore,
    handleSubmitClick: handleLoadSlotSubmitClick,
  },
];

const readSource = (path) =>
  readFileSync(new URL(`../../src/${path}`, import.meta.url), "utf8");

// The form's own values; the component store is left out because it only
// catches up when the field commits.
const createSubmitDeps = ({ slotId, valid }) => ({
  dispatchEvent: vi.fn(),
  refs: {
    form: {
      validate: vi.fn(() => ({ valid })),
      getValues: vi.fn(() => ({ slotId })),
    },
  },
});

describe.each(slotActions)(
  "$actionName action editor",
  ({ actionName, storeModule, handleSubmitClick }) => {
    it("requires a slot outside a save/load slot container", () => {
      const viewData = storeModule.selectViewData({
        state: storeModule.createInitialState(),
        props: {},
        i18n: EN_I18N,
      });

      expect(viewData.form.fields[0]).toMatchObject({
        name: "slotId",
        required: { message: AUTO_SLOT_MESSAGE },
      });
    });

    it("rejects a slot of only spaces, which would save as Auto", () => {
      const viewData = storeModule.selectViewData({
        state: storeModule.createInitialState(),
        props: {},
        i18n: EN_I18N,
      });
      const [rule] = viewData.form.fields[0].rules;
      const pattern = new RegExp(rule.value);

      expect(rule.message).toBe(AUTO_SLOT_MESSAGE);
      expect(pattern.test("   ")).toBe(false);
      expect(pattern.test(" 2 ")).toBe(true);
      expect(pattern.test("${slot.slotId}")).toBe(true);
    });

    it("shows the slot message in the app's language", () => {
      const viewData = storeModule.selectViewData({
        state: storeModule.createInitialState(),
        props: {},
        i18n: JA_I18N,
      });

      expect(viewData.form.fields[0].required.message).toBe(
        "自動はコンテナ（セーブ/ロードスロット）の中でのみ使えます。スロットIDを入力してください。",
      );
    });

    it("allows Auto where the clicked slot fills it", () => {
      const viewData = storeModule.selectViewData({
        state: storeModule.createInitialState(),
        props: { allowAutoSlot: true },
        i18n: EN_I18N,
      });

      expect(viewData.form.fields[0].required).toBe(false);
      expect(viewData.form.fields[0].rules).toBeUndefined();
    });

    it("does not submit when the form is invalid", () => {
      const deps = createSubmitDeps({ slotId: undefined, valid: false });

      handleSubmitClick(deps);

      expect(deps.refs.form.validate).toHaveBeenCalledTimes(1);
      expect(deps.dispatchEvent).not.toHaveBeenCalled();
    });

    it("submits the slot the form validated, even before the field commits", () => {
      const deps = createSubmitDeps({ slotId: " 2 ", valid: true });

      handleSubmitClick(deps);

      expect(deps.dispatchEvent).toHaveBeenCalledTimes(1);
      const [event] = deps.dispatchEvent.mock.calls[0];
      expect(event.type).toBe("submit");
      expect(event.detail).toEqual({ [actionName]: { slotId: "2" } });
    });
  },
);

describe("Auto slot availability in the action editors", () => {
  it("passes it to the slot editors and to nested confirm dialog actions", () => {
    const systemActionsView = readSource(
      "components/systemActions/systemActions.view.yaml",
    );
    const confirmDialogView = readSource(
      "components/commandLineShowConfirmDialog/commandLineShowConfirmDialog.view.yaml",
    );

    expect(systemActionsView).toContain(
      "rvn-command-line-save-slot#commandLineSaveSlot :saveSlot=${actions.saveSlot} :allowAutoSlot=${allowAutoSlot}",
    );
    expect(systemActionsView).toContain(
      "rvn-command-line-load-slot#commandLineLoadSlot :loadSlot=${actions.loadSlot} :allowAutoSlot=${allowAutoSlot}",
    );
    expect(systemActionsView).toContain(
      ":showConfirmDialog=${actions.showConfirmDialog} :allowAutoSlot=${allowAutoSlot}",
    );
    expect(
      confirmDialogView.match(/:allowAutoSlot=\$\{allowAutoSlot\}/g),
    ).toHaveLength(2);
  });

  it("is passed from the layout editor to its element actions", () => {
    const layoutEditorView = readSource(
      "pages/layoutEditor/layoutEditor.view.yaml",
    );
    const layoutEditPanelView = readSource(
      "components/layoutEditPanel/layoutEditPanel.view.yaml",
    );

    expect(
      layoutEditorView.match(/:allowAutoSlot=\$\{allowAutoSlot\}/g),
    ).toHaveLength(2);
    expect(layoutEditPanelView).toContain(
      "rvn-system-actions#systemActions :actions=${actionsData} actionType=system :hiddenModes=${hiddenSystemActionModes} :allowAutoSlot=${allowAutoSlot}",
    );
  });
});
