import { RUNTIME_ACTION_ITEMS } from "../../internal/runtimeActions.js";

const createSection = (label, items) => ({
  label,
  items,
});

const getRuntimeActionItem = (mode) => {
  return RUNTIME_ACTION_ITEMS.find((item) => item.mode === mode);
};

const SYSTEM_ACTION_SECTIONS = [
  createSection("Story", [
    {
      id: "12",
      label: "Next Line",
      icon: "settings",
      mode: "nextLine",
    },
    {
      id: "10",
      label: "Transition",
      icon: "transition",
      mode: "sectionTransition",
    },
    {
      id: "24",
      label: "Reset Story At Section",
      icon: "settings",
      mode: "resetStoryAtSection",
    },
    {
      id: "19",
      label: "Rollback",
      icon: "settings",
      mode: "rollbackByOffset",
    },
  ]),
  createSection("Dialogue", [
    {
      id: "13",
      label: "Toggle Auto Mode",
      icon: "play",
      mode: "toggleAutoMode",
    },
    {
      id: "14",
      label: "Toggle Skip Mode",
      icon: "settings",
      mode: "toggleSkipMode",
    },
    {
      id: "18",
      label: "Toggle Dialogue Box Visibility",
      icon: "settings",
      mode: "toggleDialogueUI",
    },
    getRuntimeActionItem("setDialogueTextSpeed"),
  ]),
  createSection("Layers", [
    {
      id: "15",
      label: "Push Layered View",
      icon: "layers",
      mode: "pushLayeredView",
    },
    {
      id: "16",
      label: "Pop Layered View",
      icon: "layers",
      mode: "popLayeredView",
    },
  ]),
  // createSection("Variables", [
  //   {
  //     id: "17",
  //     label: "Update Variable",
  //     icon: "variable",
  //     mode: "updateVariable",
  //   },
  // ]),
  createSection("Confirm Dialog", [
    {
      id: "20",
      label: "Show Confirm Dialog",
      icon: "settings",
      mode: "showConfirmDialog",
    },
    {
      id: "21",
      label: "Hide Confirm Dialog",
      icon: "settings",
      mode: "hideConfirmDialog",
    },
  ]),
  createSection("Save / Load", [
    {
      id: "22",
      label: "Save Slot",
      icon: "settings",
      mode: "saveSlot",
    },
    {
      id: "23",
      label: "Load Slot",
      icon: "settings",
      mode: "loadSlot",
    },
    getRuntimeActionItem("setSaveLoadPagination"),
    getRuntimeActionItem("incrementSaveLoadPagination"),
    getRuntimeActionItem("decrementSaveLoadPagination"),
  ]),
  createSection("Sound", [
    getRuntimeActionItem("setSoundVolume"),
    getRuntimeActionItem("setMusicVolume"),
  ]),
  createSection("Menu", [
    getRuntimeActionItem("setMenuPage"),
    getRuntimeActionItem("setMenuEntryPoint"),
  ]),
  // createSection("Runtime", [
  //   getRuntimeActionItem("setAutoForwardDelay"),
  //   getRuntimeActionItem("setSkipUnseenText"),
  //   getRuntimeActionItem("setSkipTransitionsAndAnimations"),
  // ]),
];

const PRESENTATION_ACTION_SECTIONS = [
  createSection("Dialogue", [
    {
      id: "2",
      label: "Dialogue Box",
      icon: "dialogue",
      mode: "dialogue",
    },
  ]),
  createSection("Visual", [
    {
      id: "4",
      label: "Background",
      icon: "image",
      mode: "background",
    },
    {
      id: "7",
      label: "Characters",
      icon: "character",
      mode: "character",
    },
    {
      id: "8",
      label: "Visuals",
      icon: "image",
      mode: "visual",
    },
  ]),
  createSection("Audio", [
    {
      id: "5",
      label: "BGM",
      icon: "music",
      mode: "bgm",
    },
    {
      id: "6",
      label: "Sound Effects",
      icon: "audio",
      mode: "sfx",
    },
  ]),
  createSection("Navigation", [
    {
      id: "3",
      label: "Choices",
      icon: "choices",
      mode: "choice",
    },
    {
      id: "9",
      label: "Next Line Config",
      icon: "settings",
      mode: "setNextLineConfig",
    },
    {
      id: "10",
      label: "Transition",
      icon: "transition",
      mode: "sectionTransition",
    },
    {
      id: "11",
      label: "Control",
      icon: "control",
      mode: "control",
    },
  ]),
];

const getHiddenModes = (attrs = {}) => {
  return Array.isArray(attrs.hiddenModes)
    ? attrs.hiddenModes.filter(
        (mode) => typeof mode === "string" && mode.length > 0,
      )
    : [];
};

const toSectionItem = (label) => ({
  type: "section",
  label,
});

const toActionItem = (item) => ({
  ...item,
  type: "item",
});

const getActionItems = (attrs = {}) => {
  const actionsType = attrs?.actionsType;
  const hiddenModes = new Set(getHiddenModes(attrs));
  const sections =
    {
      system: SYSTEM_ACTION_SECTIONS,
      presentation: PRESENTATION_ACTION_SECTIONS,
    }[actionsType] || PRESENTATION_ACTION_SECTIONS;

  return sections.flatMap((section) => {
    const visibleItems = section.items
      .filter(
        (item) =>
          item && typeof item.mode === "string" && !hiddenModes.has(item.mode),
      )
      .map(toActionItem);

    if (visibleItems.length === 0) {
      return [];
    }

    return [toSectionItem(section.label), ...visibleItems];
  });
};

export const createInitialState = () => ({});

export const selectViewData = ({ props: attrs }) => {
  return {
    items: getActionItems(attrs),
  };
};

export const selectItems = ({ props: attrs }) => {
  return getActionItems(attrs);
};
