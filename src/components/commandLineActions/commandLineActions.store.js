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
    label: "Base",
    icon: "screen",
    mode: "base",
  },
];

export const createInitialState = () => ({});

export const selectViewData = ({ attrs }) => {
  const actionsType = attrs?.["actions-type"];
  const items = {
    system: SYSTEM_ACTIONS,
    presentation: PRESENTATION_ACTIONS,
  }[actionsType];

  return {
    items,
  };
};

export const selectItems = ({ attrs }) => {
  const actionsType = attrs?.["actions-type"];
  return actionsType === "system" ? SYSTEM_ACTIONS : PRESENTATION_ACTIONS;
};
