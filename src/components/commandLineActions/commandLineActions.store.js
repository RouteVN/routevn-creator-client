export const INITIAL_STATE = Object.freeze({
  items: [
    {
      id: "2",
      label: "Dialogue Box",
      icon: "dialogue",
      mode: "dialoguebox",
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
      mode: "characters",
    },
    {
      id: "3",
      label: "Choices",
      icon: "choices",
      mode: "choices",
    },
    {
      id: "10",
      label: "Transition",
      icon: "transition",
      mode: "sceneTransition",
    },
    {
      id: "11",
      label: "Controls",
      icon: "controls",
      mode: "controls",
    },
    // {
    //   id: "12",
    //   label: "Conditional",
    //   icon: "code",
    //   mode: "conditional",
    // },
  ],
});

export const toViewData = ({ state, props }, payload) => {
  return {
    items: state.items,
  };
};

export const selectItems = ({ state, props }) => {
  return state.items;
};
