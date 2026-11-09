export const createInitialState = () => ({
  // The suggested locale and its own wording for the box, or undefined.
  suggestion: undefined,
  busy: false,
});

export const setSuggestion = ({ state }, { suggestion } = {}) => {
  state.suggestion = suggestion;
  state.busy = false;
};

export const clearSuggestion = ({ state }) => {
  state.suggestion = undefined;
  state.busy = false;
};

export const setBusy = ({ state }, { busy } = {}) => {
  state.busy = busy;
};

export const selectSuggestedLocale = ({ state }) => state.suggestion?.locale;

export const selectViewData = ({ state }) => {
  const { suggestion } = state;
  return {
    visible: Boolean(suggestion),
    locale: suggestion?.locale ?? "",
    message: suggestion?.message ?? "",
    switchLabel: suggestion?.switchLabel ?? "",
    closeLabel: suggestion?.closeLabel ?? "",
    busy: state.busy,
  };
};
