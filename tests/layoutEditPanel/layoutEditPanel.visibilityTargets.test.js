import { describe, expect, it } from "vitest";
import { toVisibilityConditionTargetOptions } from "../../src/components/layoutEditPanel/support/layoutEditPanelVisibility.js";

describe("layoutEditPanel visibility target options", () => {
  it("uses suffixText for target types and hides deferred runtime targets", () => {
    const options = toVisibilityConditionTargetOptions();

    const menuPageOption = options.find((item) => item.value === "runtime.menuPage");
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
      hiddenTargets.some((target) => options.some((item) => item.value === target)),
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
