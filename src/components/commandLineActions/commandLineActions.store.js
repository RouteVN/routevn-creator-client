export const INITIAL_STATE = Object.freeze({
  items: [
    // {
    //   id: "1",
    //   label: "Rich Text",
    //   icon: "text",
    //   mode: "richtext",
    // },
    {
      id: "2",
      label: "Dialogue Box",
      icon: "dialogue",
      mode: "dialoguebox",
    },
    // {
    //   id: "3",
    //   label: "Choices",
    //   icon: "list",
    //   mode: "choices",
    // },
    {
      id: "4",
      label: "Background",
      icon: "image",
      mode: "background",
    },
    {
      id: "5",
      label: "BGM",
      icon: "audio",
      mode: "bgm",
    },
    {
      id: "6",
      label: "Sound Effects",
      icon: "audio",
      mode: "soundeffects",
    },
    {
      id: "7",
      label: "Characters",
      icon: "character",
      mode: "characters",
    },
    {
      id: "8",
      label: "Layouts",
      icon: "layout",
      mode: "layouts",
    },
    // {
    //   id: "9",
    //   label: "Scene Transition",
    //   icon: "arrow-right",
    //   mode: "scenetransition",
    // },
    // {
    //   id: "10",
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
