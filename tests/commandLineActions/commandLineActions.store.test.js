import { describe, expect, it } from "vitest";
import { selectItems } from "../../src/components/commandLineActions/commandLineActions.store.js";

const getSectionModes = (items, label) => {
  const sectionIndex = items.findIndex(
    (item) => item.type === "section" && item.label === label,
  );

  if (sectionIndex === -1) {
    return [];
  }

  const modes = [];
  for (let index = sectionIndex + 1; index < items.length; index += 1) {
    const item = items[index];
    if (item.type === "section") {
      break;
    }
    modes.push(item.mode);
  }

  return modes;
};

describe("commandLineActions.store", () => {
  it("uses settings icons for generic system actions", () => {
    const items = selectItems({
      props: {
        actionsType: "system",
      },
    });

    const iconByMode = Object.fromEntries(
      items
        .filter((item) => item.type === "item")
        .map((item) => [item.mode, item.icon]),
    );

    expect(iconByMode.nextLine).toBe("settings");
    expect(iconByMode.resetStoryAtSection).toBe("settings");
    expect(iconByMode.rollbackByOffset).toBe("settings");
    expect(iconByMode.toggleSkipMode).toBe("settings");
    expect(iconByMode.startSkipMode).toBe("settings");
    expect(iconByMode.stopSkipMode).toBe("settings");
    expect(iconByMode.toggleDialogueUI).toBe("settings");
    expect(iconByMode.showConfirmDialog).toBe("settings");
    expect(iconByMode.hideConfirmDialog).toBe("settings");
    expect(iconByMode.saveSlot).toBe("settings");
    expect(iconByMode.loadSlot).toBe("settings");
    expect(iconByMode.setDialogueTextSpeed).toBe("settings");
    expect(iconByMode.setSaveLoadPagination).toBe("settings");
    expect(iconByMode.incrementSaveLoadPagination).toBe("settings");
    expect(iconByMode.decrementSaveLoadPagination).toBe("settings");
    expect(iconByMode.setMenuPage).toBe("settings");
    expect(iconByMode.setMenuEntryPoint).toBe("settings");
    expect(iconByMode.conditional).toBe("settings");
  });

  it("offers resetStoryAtSection in system actions and drops resetStorySession", () => {
    const modes = selectItems({
      props: {
        actionsType: "system",
      },
    })
      .filter((item) => item.type === "item")
      .map((item) => item.mode);

    expect(modes).toContain("resetStoryAtSection");
    expect(modes).not.toContain("resetStorySession");
  });

  it("groups system actions into sections", () => {
    const items = selectItems({
      props: {
        actionsType: "system",
      },
    });

    expect(items[0]).toEqual({
      type: "section",
      label: "Story",
    });
    expect(items.some((item) => item.type === "section")).toBe(true);
    expect(
      items.some((item) => item.type === "section" && item.label === "Sound"),
    ).toBe(true);
    expect(
      items.some((item) => item.type === "section" && item.label === "Menu"),
    ).toBe(true);
  });

  it("shows the variables section and update variable action", () => {
    const items = selectItems({
      props: {
        actionsType: "system",
      },
    });

    expect(
      items.some(
        (item) => item.type === "section" && item.label === "Variables",
      ),
    ).toBe(true);
    expect(items.some((item) => item.mode === "updateVariable")).toBe(true);
  });

  it("shows conditional actions in the logic section", () => {
    const systemItems = selectItems({
      props: {
        actionsType: "system",
      },
    });
    const presentationItems = selectItems({
      props: {
        actionsType: "presentation",
      },
    });

    expect(getSectionModes(systemItems, "Logic")).toEqual(["conditional"]);
    expect(getSectionModes(presentationItems, "Logic")).toEqual([
      "conditional",
    ]);
  });

  it("moves dialogue text speed into the dialogue section", () => {
    const items = selectItems({
      props: {
        actionsType: "system",
      },
    });

    expect(getSectionModes(items, "Dialogue")).toContain(
      "setDialogueTextSpeed",
    );
    expect(getSectionModes(items, "Dialogue")).toEqual(
      expect.arrayContaining(["startSkipMode", "stopSkipMode"]),
    );
    expect(getSectionModes(items, "Sound")).not.toContain(
      "setDialogueTextSpeed",
    );
    expect(getSectionModes(items, "Menu")).not.toContain(
      "setDialogueTextSpeed",
    );
  });

  it("moves save load pagination actions into the save load section", () => {
    const items = selectItems({
      props: {
        actionsType: "system",
      },
    });

    expect(getSectionModes(items, "Save / Load")).toEqual(
      expect.arrayContaining([
        "setSaveLoadPagination",
        "incrementSaveLoadPagination",
        "decrementSaveLoadPagination",
      ]),
    );
    expect(getSectionModes(items, "Sound")).not.toContain(
      "setSaveLoadPagination",
    );
    expect(getSectionModes(items, "Menu")).not.toContain(
      "setSaveLoadPagination",
    );
  });

  it("removes mute all from the chooser", () => {
    const items = selectItems({
      props: {
        actionsType: "system",
      },
    });

    expect(items.some((item) => item.mode === "setMuteAll")).toBe(false);
  });

  it("hides the runtime toggles that are deferred for later", () => {
    const items = selectItems({
      props: {
        actionsType: "system",
      },
    });

    expect(items.some((item) => item.mode === "setAutoForwardDelay")).toBe(
      false,
    );
    expect(items.some((item) => item.mode === "setSkipUnseenText")).toBe(false);
    expect(
      items.some((item) => item.mode === "setSkipTransitionsAndAnimations"),
    ).toBe(false);
  });

  it("moves sound and menu actions into dedicated sections", () => {
    const items = selectItems({
      props: {
        actionsType: "system",
      },
    });

    expect(getSectionModes(items, "Sound")).toEqual(
      expect.arrayContaining(["setSoundVolume", "setMusicVolume"]),
    );
    expect(getSectionModes(items, "Menu")).toEqual(
      expect.arrayContaining(["setMenuPage", "setMenuEntryPoint"]),
    );
  });

  it("drops empty sections after hidden mode filtering", () => {
    const items = selectItems({
      props: {
        actionsType: "system",
        hiddenModes: [
          "setSoundVolume",
          "setMusicVolume",
          "setMenuPage",
          "setMenuEntryPoint",
        ],
      },
    });

    expect(
      items.some((item) => item.type === "section" && item.label === "Sound"),
    ).toBe(false);
    expect(
      items.some((item) => item.type === "section" && item.label === "Menu"),
    ).toBe(false);
  });

  it("adds resetStoryAtSection to the navigation presentation section only", () => {
    const items = selectItems({
      props: {
        actionsType: "presentation",
      },
    });

    expect(getSectionModes(items, "Dialogue")).toEqual(["dialogue"]);
    expect(getSectionModes(items, "Audio")).toEqual(["bgm", "sfx"]);
    expect(getSectionModes(items, "Navigation")).toEqual(
      expect.arrayContaining([
        "choice",
        "setNextLineConfig",
        "sectionTransition",
        "resetStoryAtSection",
        "control",
      ]),
    );
    expect(
      items.some(
        (item) => item.type === "section" && item.label === "Save / Load",
      ),
    ).toBe(false);
    expect(
      items.some((item) => item.type === "section" && item.label === "Menu"),
    ).toBe(false);
  });
});
