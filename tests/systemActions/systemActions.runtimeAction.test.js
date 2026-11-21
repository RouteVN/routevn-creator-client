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
import { EN_I18N, JA_I18N, PT_I18N, ZH_HANS_I18N } from "../support/i18n.js";

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

describe("systemActions random variable operation summary", () => {
  const VARIABLES = {
    dice: {
      id: "dice",
      type: "variable",
      name: "Dice",
      variableType: "number",
    },
    lucky: {
      id: "lucky",
      type: "variable",
      name: "Lucky",
      variableType: "boolean",
    },
    weather: {
      id: "weather",
      type: "variable",
      name: "Weather",
      variableType: "string",
    },
  };

  const previewRandomOperations = (operations, i18n) =>
    selectActionsData({
      state: {
        ...createInitialState(),
        repositoryState: { variables: { items: VARIABLES, tree: [] } },
      },
      props: { actions: { updateVariable: { id: "update1", operations } } },
      copy: selectCommandLineCopy(i18n),
      dateTime: i18n.dateTime,
    }).preview.updateVariable;

  it("names what each random operation draws from, next to the other operations", () => {
    const preview = previewRandomOperations(
      [
        {
          variableId: "dice",
          op: "random",
          distribution: { type: "integer", min: 1, max: 6 },
        },
        {
          variableId: "weather",
          op: "random",
          distribution: {
            type: "weighted",
            values: [
              { weight: 60, value: "sunny" },
              { weight: 40, value: "rain" },
            ],
          },
        },
        {
          variableId: "lucky",
          op: "random",
          distribution: {
            type: "weighted",
            values: [
              { weight: 1, value: true },
              { weight: 1, value: false },
            ],
          },
        },
        { variableId: "dice", op: "increment", value: 2 },
      ],
      EN_I18N,
    );

    expect(preview).toEqual({
      summary:
        "Dice = random (1 to 6), Weather = random (sunny, rain), Lucky = random (True, False), Dice +2",
      operationCount: 4,
    });
  });

  it.each([
    ["another type", { type: "dice" }],
    ["a range for a boolean variable", { type: "integer", min: 0, max: 1 }],
    ["no distribution", undefined],
  ])("shows only Random for %s", (_label, distribution) => {
    const variableId = distribution?.type === "integer" ? "lucky" : "dice";
    const name = VARIABLES[variableId].name;

    expect(
      previewRandomOperations(
        [{ variableId, op: "random", distribution }],
        EN_I18N,
      ).summary,
    ).toBe(`${name} = random`);
  });

  it("shows only Random in Japanese for an operation it cannot show", () => {
    const copy = JA_I18N.commandLinePage;

    expect(copy["{variable} = random"]).toEqual(expect.any(String));
    expect(copy["{variable} = random"]).not.toBe("{variable} = random");
    expect(
      previewRandomOperations(
        [{ variableId: "dice", op: "random", distribution: { type: "dice" } }],
        JA_I18N,
      ).summary,
    ).toBe(copy["{variable} = random"].replace("{variable}", "Dice"));
  });

  it("uses the catalog's templates and list separator in Japanese", () => {
    const copy = JA_I18N.commandLinePage;
    const preview = previewRandomOperations(
      [
        {
          variableId: "lucky",
          op: "random",
          distribution: {
            type: "weighted",
            values: [
              { weight: 1, value: true },
              { weight: 1, value: false },
            ],
          },
        },
      ],
      JA_I18N,
    );

    expect(copy["{variable} = random ({values})"]).toEqual(expect.any(String));
    expect(preview.summary).toBe(
      copy["{variable} = random ({values})"]
        .replace("{variable}", "Lucky")
        .replace("{values}", "真、偽"),
    );
  });
});
