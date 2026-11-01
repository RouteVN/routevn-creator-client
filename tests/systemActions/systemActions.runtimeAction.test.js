import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectActionsData,
  selectViewData,
  setMode,
  updateActions,
} from "../../src/components/systemActions/systemActions.store.js";
import { selectCommandLineCopy } from "../../src/internal/ui/sceneEditor/commandLineCopy.js";
import { EN_I18N, PT_I18N, ZH_HANS_I18N } from "../support/i18n.js";

const previewActions = (actions, i18n) =>
  selectActionsData({
    state: createInitialState(),
    props: { actions },
    copy: selectCommandLineCopy(i18n),
  }).preview;

describe("systemActions runtime action editor", () => {
  it.each([
    ["setMenuPage", "options"],
    ["setMenuEntryPoint", "story"],
  ])("selects the existing %s action for the editor", (mode, value) => {
    const state = createInitialState();

    updateActions(
      { state },
      {
        [mode]: { value },
      },
    );
    setMode({ state }, { mode });

    expect(
      selectViewData({
        state,
        props: {},
        i18n: EN_I18N,
      }).runtimeAction,
    ).toEqual({ value });
  });

  it("offers Current Value to the runtime action editor only when the trigger has a value", () => {
    const allowCurrentValue = (props) =>
      selectViewData({ state: createInitialState(), props, i18n: EN_I18N })
        .allowCurrentValue;
    const readView = (path) =>
      readFileSync(
        new URL(`../../src/components/${path}`, import.meta.url),
        "utf8",
      );

    expect(allowCurrentValue({})).toBe(false);
    expect(allowCurrentValue({ allowCurrentValue: true })).toBe(true);
    expect(readView("systemActions/systemActions.view.yaml")).toContain(
      "rvn-command-line-runtime-action#commandLineRuntimeAction :mode=${mode} :action=${runtimeAction} :allowCurrentValue=${allowCurrentValue}",
    );
    expect(readView("layoutEditPanel/layoutEditPanel.view.yaml")).toContain(
      ":allowAutoSlot=${allowAutoSlot} :allowCurrentValue=${allowCurrentValue}",
    );
    // A confirm dialog's actions run on the click on its button, which has no
    // value.
    expect(
      readView(
        "commandLineShowConfirmDialog/commandLineShowConfirmDialog.view.yaml",
      ),
    ).not.toContain("allowCurrentValue");
  });

  it("passes the selected action through a direct template binding", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/systemActions/systemActions.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain(":action=${runtimeAction}");
    expect(view).not.toContain(":action=${actions[mode]}");
  });

  it("summarizes runtime actions in the active locale", () => {
    const preview = previewActions(
      {
        setMuteAll: { value: true },
        setMenuPage: { value: "options" },
        setMenuEntryPoint: { value: "pause-menu" },
        setMusicVolume: { value: "_event.value" },
        incrementSaveLoadPagination: {},
      },
      PT_I18N,
    );

    expect(preview.setMuteAll.summary).toBe(
      "Definir “Silenciar tudo”: Verdadeiro",
    );
    expect(preview.setMenuPage.summary).toBe(
      "Definir página atual do menu: Opções",
    );
    expect(preview.setMenuEntryPoint.summary).toBe(
      "Definir ponto de entrada do menu: pause-menu",
    );
    expect(preview.setMusicVolume.summary).toBe(
      "Definir volume da música: Valor atual",
    );
    expect(preview.incrementSaveLoadPagination.summary).toBe(
      "Página seguinte de jogos guardados",
    );
    expect(
      previewActions({ setMuteAll: { value: false } }, ZH_HANS_I18N).setMuteAll
        .summary,
    ).toBe("设置全部静音：假");
    expect(
      previewActions({ setMuteAll: { value: false } }, EN_I18N).setMuteAll
        .summary,
    ).toBe("Set Mute All: False");
  });

  it("shows a boolean variable update with the True or False label", () => {
    const preview = previewActions(
      {
        updateVariable: {
          id: "updateVariable1",
          operations: [
            { variableId: "enabled", op: "set", value: true },
            { variableId: "name", op: "set", value: "true" },
          ],
        },
      },
      PT_I18N,
    );

    expect(preview.updateVariable.summary).toBe(
      "enabled = Verdadeiro, name = true",
    );
  });
});
