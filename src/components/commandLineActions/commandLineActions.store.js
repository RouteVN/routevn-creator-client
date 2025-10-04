export const createInitialState = () => ({
  items: [
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
      label: "Screen",
      icon: "screen",
      mode: "screen",
    },
    {
      id: "12",
      label: "Next Line",
      icon: "next-line",
      mode: "nextLine",
    },
    // {
    //   id: "13",
    //   label: "Controls",
    //   icon: "controls",
    //   mode: "controls",
    // },
    // {
    //   id: "12",
    //   label: "Conditional",
    //   icon: "code",
    //   mode: "conditional",
    // },
  ],
});

export const selectViewData = ({ state }) => {
  return {
    items: state.items,
  };
};

export const selectItems = ({ state }) => {
  return state.items;
};
