export const INITIAL_STATE = Object.freeze({
  selectedStepId: undefined,
});


export const setSelectedStepId = (state, selectedStepId) => {
  state.selectedStepId = selectedStepId;
}

export const toViewData = ({ state, props }, payload) => {
  return {
    steps: props.steps || [],
    selectedStepId: state.selectedStepId,
  }
}

