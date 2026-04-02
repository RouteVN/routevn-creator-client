// Define action sets as constants
const SYSTEM_ACTIONS = [
  {
    id: "12",
    label: "Next Line",
    icon: "next-line",
    mode: "nextLine",
  },
  {
    id: "10",
    label: "Transition",
    icon: "transition",
    mode: "sectionTransition",
  },
  {
    id: "13",
    label: "Toggle Auto Mode",
    icon: "play",
    mode: "toggleAutoMode",
  },
  {
    id: "14",
    label: "Toggle Skip Mode",
    icon: "next-line",
    mode: "toggleSkipMode",
  },
  {
    id: "18",
    label: "Toggle Dialogue Box",
    icon: "dialogue",
    mode: "toggleDialogueUI",
  },
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
  {
    id: "17",
    label: "Update Variable",
    icon: "variable",
    mode: "updateVariable",
  },
  {
    id: "19",
    label: "Rollback",
    icon: "next-line",
    mode: "rollbackByOffset",
  },
  {
    id: "20",
    label: "Show Confirm Dialog",
    icon: "dialogue",
    mode: "showConfirmDialog",
  },
  {
    id: "21",
    label: "Hide Confirm Dialog",
    icon: "dialogue",
    mode: "hideConfirmDialog",
  },
  {
    id: "22",
    label: "Save Slot",
    icon: "dialogue",
    mode: "saveSlot",
  },
  {
    id: "23",
    label: "Load Slot",
    icon: "dialogue",
    mode: "loadSlot",
  },
];

const PRESENTATION_ACTIONS = [
  {
    id: "2",
    label: "Dialogue Box",
    icon: "dialogue",
    mode: "dialogue",
  },
  {
    id: "4",
    label: "Background",
    icon: "image",
    mode: "background",
  },
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
  {
    id: "9",
    label: "Next Line Config",
    icon: "settings",
    mode: "setNextLineConfig",
  },
  {
    id: "3",
    label: "Choices",
    icon: "choices",
    mode: "choice",
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
];

const getHiddenModes = (attrs = {}) => {
  return Array.isArray(attrs.hiddenModes)
    ? attrs.hiddenModes.filter(
        (mode) => typeof mode === "string" && mode.length > 0,
      )
    : [];
};

const getActionItems = (attrs = {}) => {
  const actionsType = attrs?.actionsType;
  const hiddenModes = new Set(getHiddenModes(attrs));
  const items =
    {
      system: SYSTEM_ACTIONS,
      presentation: PRESENTATION_ACTIONS,
    }[actionsType] || PRESENTATION_ACTIONS;

  return items.filter((item) => !hiddenModes.has(item.mode));
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
