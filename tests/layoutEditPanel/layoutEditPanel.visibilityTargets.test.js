import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setValues,
  setVariablesData,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
import { selectLayoutEditPanelCopy } from "../../src/components/layoutEditPanel/support/layoutEditPanelCopy.js";
import {
  getVisibilityConditionSummary,
  getVisibilityConditionSummaryParts,
  toSectionedVisibilityConditionTargetOptions,
} from "../../src/components/layoutEditPanel/support/layoutEditPanelVisibility.js";
import { toVariableConditionTarget } from "../../src/internal/layoutConditions.js";
import { EN_I18N } from "../support/i18n.js";

describe("layoutEditPanel visibility target options", () => {
  it("groups system targets first and variables by folder order", () => {
    const options = toSectionedVisibilityConditionTargetOptions({
      items: {
        player: { id: "player", type: "folder", name: "Player" },
        flags: { id: "flags", type: "folder", name: "Flags" },
        playerName: {
          id: "playerName",
          type: "variable",
          name: "Player Name",
          variableType: "string",
        },
        score: {
          id: "score",
          type: "variable",
          name: "Score",
          variableType: "number",
        },
        hasKey: {
          id: "hasKey",
          type: "variable",
          name: "Has Key",
          variableType: "boolean",
        },
      },
      tree: [
        {
          id: "player",
          children: [{ id: "playerName" }, { id: "score" }],
        },
        { id: "flags", children: [{ id: "hasKey" }] },
      ],
    });
    const sections = options.filter((item) => item.type === "section");

    expect(sections.map((item) => item.label)).toEqual([
      "System",
      "Player",
      "Flags",
    ]);
    expect(options[0]).toEqual({ type: "section", label: "System" });
    expect(
      options
        .slice(options.indexOf(sections[1]) + 1, options.indexOf(sections[2]))
        .map((item) => item.label),
    ).toEqual(["Player Name", "Score"]);
  });

  it("uses suffixText for target types and hides deferred runtime targets", () => {
    const options = toSectionedVisibilityConditionTargetOptions().filter(
      (item) => item.type !== "section",
    );

    const menuPageOption = options.find(
      (item) => item.value === "runtime.menuPage",
    );
    const hiddenTargets = [
      "runtime.autoForwardDelay",
      "runtime.dialogueTextSpeed",
      "runtime.musicVolume",
      "runtime.muteAll",
      "runtime.skipTransitionsAndAnimations",
      "runtime.skipUnseenText",
      "runtime.soundVolume",
    ];

    expect(menuPageOption).toEqual({
      label: "Menu Page",
      value: "runtime.menuPage",
      suffixText: "string",
    });
    expect(
      hiddenTargets.some((target) =>
        options.some((item) => item.value === target),
      ),
    ).toBe(false);
    expect(options.some((item) => item.label.includes("("))).toBe(false);
  });

  it("includes the current dialogue character target as a character selector", () => {
    const options = toSectionedVisibilityConditionTargetOptions();

    expect(
      options.find((item) => item.value === "dialogue.characterId"),
    ).toEqual({
      label: "Current Dialogue Character",
      value: "dialogue.characterId",
      suffixText: "character",
    });
  });
});

describe("layoutEditPanel visibility condition dialog", () => {
  const CONSTANTS = yaml.load(
    readFileSync(
      new URL(
        "../../src/components/layoutEditPanel/layoutEditPanel.constants.yaml",
        import.meta.url,
      ),
      "utf8",
    ),
  );

  it("lists its targets by section, as the conditional override targets are, with search", () => {
    const state = createInitialState();
    setValues({ state }, { values: { id: "text-1", type: "text" } });
    setVariablesData(
      { state },
      {
        variablesData: {
          items: {
            flags: { id: "flags", type: "folder", name: "Flags" },
            hasKey: {
              id: "hasKey",
              type: "variable",
              name: "Has Key",
              variableType: "boolean",
            },
            score: {
              id: "score",
              type: "variable",
              name: "Score",
              variableType: "number",
            },
          },
          tree: [
            { id: "flags", children: [{ id: "hasKey" }] },
            { id: "score" },
          ],
        },
      },
    );

    const viewData = selectViewData({
      state,
      props: {},
      constants: CONSTANTS,
      i18n: EN_I18N,
    });
    const visibilityTarget = viewData.visibilityConditionDialogForm.fields[0];
    const overrideTarget = viewData.conditionalOverrideConditionForm.fields[0];

    expect(visibilityTarget.options).toEqual(overrideTarget.options);
    expect(
      visibilityTarget.options
        .filter((item) => item.type === "section")
        .map((item) => item.label),
    ).toEqual(["System", "Flags", "Variables"]);
    expect(visibilityTarget).toMatchObject({
      name: "target",
      type: "select",
      searchable: true,
      searchPlaceholder: "Search targets...",
      emptySearchLabel: "No targets found",
    });
    // Clearing the target removes the visibility condition.
    expect(visibilityTarget.required).toBe(false);
  });
});

describe("layoutEditPanel visibility summary", () => {
  const variablesData = {
    items: {
      playerName: {
        id: "playerName",
        type: "variable",
        name: "Player Name",
        variableType: "string",
      },
      score: {
        id: "score",
        type: "variable",
        name: "Score",
        variableType: "number",
      },
      hasKey: {
        id: "hasKey",
        type: "variable",
        name: "Has Key",
        variableType: "boolean",
      },
    },
    tree: [{ id: "playerName" }, { id: "score" }, { id: "hasKey" }],
  };
  const copy = selectLayoutEditPanelCopy(EN_I18N);
  const summarize = (target, value) =>
    getVisibilityConditionSummary(
      { target, op: "eq", value },
      variablesData,
      {},
      copy,
    );

  it("reads as its target, the operation as the dialog names it, and its value", () => {
    expect(summarize(toVariableConditionTarget("score"), 10)).toBe(
      "Score Equals 10",
    );
    expect(summarize(toVariableConditionTarget("playerName"), "Alex")).toBe(
      "Player Name Equals Alex",
    );
    // True and False as the dialog's Value control names them.
    expect(summarize(toVariableConditionTarget("hasKey"), true)).toBe(
      "Has Key Equals True",
    );
    expect(summarize(toVariableConditionTarget("hasKey"), false)).toBe(
      "Has Key Equals False",
    );
    expect(
      getVisibilityConditionSummary(undefined, variablesData, {}, copy),
    ).toBe("Always visible");
  });

  it("gives the target, the operation, and the value as parts", () => {
    expect(
      getVisibilityConditionSummaryParts(
        { target: toVariableConditionTarget("hasKey"), op: "eq", value: true },
        variablesData,
        {},
        copy,
      ),
    ).toEqual([
      { kind: "target", text: "Has Key" },
      { kind: "operator", text: "Equals" },
      { kind: "value", text: "True" },
    ]);
    expect(
      getVisibilityConditionSummaryParts(undefined, variablesData, {}, copy),
    ).toEqual([{ kind: "text", text: "Always visible" }]);
  });

  it("fills the panel's width, with the operation in the primary color", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/layoutEditPanel/layoutEditPanel.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const conditionBlock = view.slice(
      view.indexOf("$elif item.type == 'condition-summary':"),
      view.indexOf("$elif item.type == 'conditional-override-list':"),
    );
    const conditionLine = conditionBlock
      .split("\n")
      .find((line) => line.includes("rtgl-view#conditionItem"));

    expect(conditionLine).toContain(" w=f ");
    expect(conditionBlock).toContain("$for part, k in item.parts:");
    expect(conditionBlock).toContain(
      "rtgl-text key=${part.kind} s=sm c=pr: ${part.text}",
    );
    expect(conditionBlock).toContain(
      "rtgl-text key=${part.kind} s=sm c=mu-fg: ${part.text}",
    );
    expect(conditionBlock).toContain(
      "rtgl-text key=${part.kind} s=sm: ${part.text}",
    );
    expect(view).not.toContain("layoutEditorConditionChip");
  });
});
