
export const INITIAL_STATE = Object.freeze({
  currentSteps: [],
  selectedStepId: undefined,
  currentInstructions: [{
    id: '1',
    instructions: {
      presentationInstructions: {},
    }
  }],
  mode: 'steps-editor',
});

export const setCurrentSteps = (state, steps) => {  
  state.currentSteps = steps
}

export const setSelectedStepId = (state, selectedStepId) => {
  state.selectedStepId = selectedStepId;
}

export const setMode = (state, mode) => {
  state.mode = mode;
}

export const toViewData = ({ state, props }, payload) => {
  const currentStep = selectSelectedStep(state, props, payload)
  return {
    currentSteps: state.currentSteps,
    currentInstructions: state.currentInstructions,
    currentStep: currentStep,
    background: currentStep?.presentation?.background,
    mode: state.mode,
  };
}

export const selectStepIdIndex = (state, props, payload) => {
  const { stepId } = payload;
  return state.currentSteps.findIndex(step => step.id === stepId);
}

export const selectPreviousStepId = (state, props, payload) => {
  const { stepId } = payload;
  const stepIndex = state.currentSteps.findIndex(step => step.id === stepId);
  if (stepIndex === 0) {
    return stepId;
  }
  return state.currentSteps[stepIndex - 1]?.id;
}

export const selectNextStepId = (state, props, payload) => {
  const { stepId } = payload;
  const stepIndex = state.currentSteps.findIndex(step => step.id === stepId);
  if (stepIndex === state.currentSteps.length - 1) {
    return stepId;
  }
  return state.currentSteps[stepIndex + 1]?.id;
}

export const selectSelectedStep = (state, props, payload) => {
  return state.currentSteps.find(step => step.id === state.selectedStepId);
}

