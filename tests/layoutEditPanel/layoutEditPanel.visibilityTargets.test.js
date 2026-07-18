import { describe, expect, it } from "vitest";
import {
  toSectionedVisibilityConditionTargetOptions,
  toVisibilityConditionTargetOptions,
} from "../../src/components/layoutEditPanel/support/layoutEditPanelVisibility.js";

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
    const options = toVisibilityConditionTargetOptions();

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
    const options = toVisibilityConditionTargetOptions();

    expect(
      options.find((item) => item.value === "dialogue.characterId"),
    ).toEqual({
      label: "Current Dialogue Character",
      value: "dialogue.characterId",
      suffixText: "character",
    });
  });
});
