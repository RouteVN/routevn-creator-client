import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  selectItems as selectItemsBase,
  selectViewData,
} from "../../src/components/commandLineActions/commandLineActions.store.js";
import { PRESENTATION_ACTION_MODE_ORDER } from "../../src/internal/presentationActionOrder.js";
import { EN_I18N, JA_I18N } from "../support/i18n.js";

const selectItems = ({ props }) => selectItemsBase({ props, i18n: EN_I18N });

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
  it("provides the standard localized Actions breadcrumb", () => {
    expect(
      selectViewData({
        props: { actionsType: "presentation" },
        i18n: EN_I18N,
      }).breadcrumb,
    ).toEqual([{ id: "actions", label: "Actions" }]);
  });

  it("uses the canonical presentation action order", () => {
    const modes = selectItems({
      props: {
        actionsType: "presentation",
      },
    })
      .filter((item) => item.type === "item")
      .map((item) => item.mode);

    expect(modes).toEqual(
      PRESENTATION_ACTION_MODE_ORDER.filter(
        (mode) => mode !== "resetStoryAtSection",
      ),
    );
  });

  it("labels the character action as Character Sprites", () => {
    const characterAction = selectItems({
      props: {
        actionsType: "presentation",
      },
    }).find((item) => item.mode === "character");

    expect(characterAction?.label).toBe("Character Sprites");
  });

  it("distinguishes the visual icon from the background icon", () => {
    const items = selectItems({
      props: {
        actionsType: "presentation",
      },
    });
    const backgroundAction = items.find((item) => item.mode === "background");
    const visualAction = items.find((item) => item.mode === "visual");

    expect(backgroundAction?.icon).toBe("image");
    expect(visualAction?.icon).toBe("stacked-images");
  });

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
    expect(iconByMode.resetStoryAtSection).toBeUndefined();
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

  it.each(["presentation", "system"])(
    "uses the random icon for the %s random action",
    (actionsType) => {
      const randomAction = selectItems({
        props: {
          actionsType,
        },
      }).find((item) => item.mode === "random");

      expect(randomAction).toMatchObject({
        id: "31",
        label: "Random",
        icon: "random",
      });
      expect(existsSync(new URL("../../svg/random.svg", import.meta.url))).toBe(
        true,
      );
    },
  );

  it("offers sectionTransition without deprecated reset actions", () => {
    const modes = selectItems({
      props: {
        actionsType: "system",
      },
    })
      .filter((item) => item.type === "item")
      .map((item) => item.mode);

    expect(modes).toContain("sectionTransition");
    expect(modes).not.toContain("resetStoryAtSection");
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

  it.each(["presentation", "system"])(
    "localizes every %s section heading",
    (actionsType) => {
      const sectionLabels = selectItemsBase({
        props: { actionsType },
        i18n: JA_I18N,
      })
        .filter((item) => item.type === "section")
        .map((item) => item.label);

      expect(sectionLabels.length).toBeGreaterThan(0);
      expect(
        sectionLabels.filter((label) => /^[\x20-\x7e]+$/.test(label)),
      ).toEqual([]);
    },
  );

  it("shows update variable in the logic section", () => {
    for (const actionsType of ["system", "presentation"]) {
      const items = selectItems({
        props: {
          actionsType,
        },
      });

      expect(getSectionModes(items, "Variables")).toEqual([]);
      expect(getSectionModes(items, "Logic")).toContain("updateVariable");
      expect(items.some((item) => item.mode === "updateVariable")).toBe(true);
    }
  });

  it("shows random and conditional actions in the logic section", () => {
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

    expect(getSectionModes(systemItems, "Logic")).toEqual([
      "updateVariable",
      "random",
      "conditional",
    ]);
    expect(getSectionModes(presentationItems, "Logic")).toEqual([
      "updateVariable",
      "random",
      "conditional",
    ]);
    expect(systemItems.some((item) => item.mode === "conditional")).toBe(true);
    expect(presentationItems.some((item) => item.mode === "conditional")).toBe(
      true,
    );
    expect(systemItems.some((item) => item.mode === "random")).toBe(true);
    expect(presentationItems.some((item) => item.mode === "random")).toBe(true);
  });

  it("honors explicit hidden modes for conditional actions", () => {
    const items = selectItems({
      props: {
        actionsType: "system",
        hiddenModes: ["conditional"],
        allowedModes: ["conditional", "updateVariable"],
      },
    });

    expect(getSectionModes(items, "Logic")).toEqual(["updateVariable"]);
    expect(items.some((item) => item.mode === "conditional")).toBe(false);
  });

  it("honors explicit hidden modes for random actions", () => {
    const items = selectItems({
      props: {
        actionsType: "system",
        hiddenModes: ["random"],
        allowedModes: ["conditional", "random", "updateVariable"],
      },
    });

    expect(getSectionModes(items, "Logic")).toEqual([
      "updateVariable",
      "conditional",
    ]);
    expect(items.some((item) => item.mode === "random")).toBe(false);
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

  it("filters actions to allowed modes when provided", () => {
    const items = selectItems({
      props: {
        actionsType: "system",
        allowedModes: [
          "sectionTransition",
          "resetStoryAtSection",
          "updateVariable",
        ],
      },
    });

    expect(getSectionModes(items, "Story")).toEqual(["sectionTransition"]);
    expect(getSectionModes(items, "Logic")).toEqual(["updateVariable"]);
    expect(
      items.filter((item) => item.type === "item").map((item) => item.mode),
    ).toEqual(["sectionTransition", "updateVariable"]);
  });

  it("offers section transitions in the navigation presentation section", () => {
    const items = selectItems({
      props: {
        actionsType: "presentation",
      },
    });

    expect(getSectionModes(items, "Dialogue")).toEqual(["dialogue"]);
    expect(getSectionModes(items, "Visual")).toEqual(
      expect.arrayContaining(["screen", "background", "character", "visual"]),
    );
    expect(getSectionModes(items, "Audio")).toEqual(["bgm", "voice", "sfx"]);
    expect(items.find((item) => item.mode === "voice")).toMatchObject({
      label: "Voice",
      icon: "microphone",
    });
    expect(getSectionModes(items, "Navigation")).toEqual(
      expect.arrayContaining([
        "choice",
        "input",
        "setNextLineConfig",
        "sectionTransition",
        "control",
      ]),
    );
    expect(items.some((item) => item.mode === "resetStoryAtSection")).toBe(
      false,
    );
    expect(items.find((item) => item.mode === "input")?.icon).toBe("input");
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
