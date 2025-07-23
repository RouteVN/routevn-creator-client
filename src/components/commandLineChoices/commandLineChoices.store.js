export const INITIAL_STATE = Object.freeze({
  choices: [
    { text: "Choice 1", target: "" },
    { text: "Choice 2", target: "" },
  ],
  selectedLayoutId: "",
});

export const addChoice = (state) => {
  state.choices.push({
    text: `Choice ${state.choices.length + 1}`,
    target: "",
  });
};

export const removeChoice = (state, index) => {
  if (state.choices.length > 1) {
    state.choices.splice(index, 1);
  }
};

export const updateChoice = (state, { index, text, target }) => {
  if (state.choices[index]) {
    if (text !== undefined) state.choices[index].text = text;
    if (target !== undefined) state.choices[index].target = target;
  }
};

export const setSelectedLayoutId = (state, payload) => {
  state.selectedLayoutId = payload.layoutId;
};

export const toViewData = ({ state, props }, payload) => {
  const layouts = props?.layouts || [];

  const layoutOptions = layouts.map((layout) => ({
    value: layout.id,
    label: layout.name,
  }));

  return {
    choices: state.choices,
    layouts: layoutOptions,
    selectedLayoutId: state.selectedLayoutId,
  };
};
