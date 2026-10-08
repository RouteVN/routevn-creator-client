import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setValues,
  setVariablesData,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
import { toSectionedVisibilityConditionTargetOptions } from "../../src/components/layoutEditPanel/support/layoutEditPanelVisibility.js";
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
