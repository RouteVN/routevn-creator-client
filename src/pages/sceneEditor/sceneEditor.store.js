
export const INITIAL_STATE = Object.freeze({
  sceneId: undefined,
  scene: undefined,
  selectedStepId: undefined,
  currentInstructions: [{
    id: '1',
    instructions: {
      presentationInstructions: {},
    }
  }],
  mode: 'steps-editor',
  selectedSectionId: '1',
  dropdownMenu: {
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [],
    sectionId: null
  },
  popover: {
    isOpen: false,
    position: { x: 0, y: 0 },
    sectionId: null
  },
});

export const setScene = (state, payload) => {
  const { id, scene } = payload;
  state.scene = scene;
  state.sceneId = id;
}

export const selectScene = ({ state, props }, payload) => {
  return state.scene;
}

export const selectSceneId = ({ state, props }, payload) => {
  return state.sceneId;
}

export const selectSelectedSectionId = ({ state, props }, payload) => {
  return state.selectedSectionId;
}

export const setSelectedStepId = (state, selectedStepId) => {
  state.selectedStepId = selectedStepId;
}

export const setMode = (state, mode) => {
  state.mode = mode;
}

export const setSelectedSectionId = (state, selectedSectionId) => {
  state.selectedSectionId = selectedSectionId;
}

export const showSectionDropdownMenu = (state, { position, sectionId }) => {
  state.dropdownMenu = {
    isOpen: true,
    position,
    items: [
      { label: 'Rename', type: 'item', value: 'rename-section' },
      { label: 'Delete', type: 'item', value: 'delete-section' }
    ],
    sectionId
  };
}

export const hideDropdownMenu = (state) => {
  state.dropdownMenu = {
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [],
    sectionId: null
  };
}

export const showPopover = (state, { position, sectionId }) => {
  state.popover = {
    isOpen: true,
    position,
    sectionId,
  };
}

export const hidePopover = (state) => {
  state.popover = {
    isOpen: false,
    position: { x: 0, y: 0 },
    sectionId: null
  };
}

export const toViewData = ({ state, props }, payload) => {
  // const currentStep = selectSelectedStep(state, props, payload)

  const sections = state.scene.sections.map(section => {
    return {
      ...section,
      bgc: section.id === state.selectedSectionId ? 'mu' : '',
    }
  })

  // const currentSteps = state.sections.find(section => section.id === state.selectedSectionId).steps;

  // Get current section for rename form
  const currentSection = state.scene.sections.find(section => section.id === state.selectedSectionId);
  
  // Form configuration for renaming
  const renameForm = currentSection ? {
    fields: [{
      id: 'name',
      fieldName: 'name',
      inputType: 'inputText',
      label: 'Section Name',
      value: currentSection.name || '',
      required: true,
    }],
    actions: {
      layout: '',
      buttons: [{
        id: 'submit',
        variant: 'pr',
        content: 'Rename',
      }, {
        id: 'cancel',
        variant: 'se',
        content: 'Cancel',
      }],
    }
  } : null;

  console.log('currentSection', currentSection)

  return {
    scene: state.scene,
    sections,
    currentSteps: currentSection?.steps || [],
    currentInstructions: [],
    currentStep: {},
    // currentStep: currentSteps.find(step => step.id === state.selectedStepId),
    // background: currentStep?.presentation?.background,
    mode: state.mode,
    dropdownMenu: state.dropdownMenu,
    popover: state.popover,
    form: renameForm,
  };
}

export const selectStepIdIndex = (state, props, payload) => {
  const { stepId } = payload;
  return state.currentSteps.findIndex(step => step.id === stepId);
}

export const selectPreviousStepId = ({ state, props }, payload) => {
  const { stepId } = payload;
  const currentSection = state.scene.sections.find(section => section.id === state.selectedSectionId);
  const currentSteps = currentSection?.steps || [];
  const stepIndex = currentSteps.findIndex(step => step.id === stepId);
  if (stepIndex === 0) {
    return stepId;
  }
  return currentSteps[stepIndex - 1]?.id;
}

export const selectNextStepId = ({ state, props }, payload) => {
  const { stepId } = payload;
  const currentSection = state.scene.sections.find(section => section.id === state.selectedSectionId);
  const currentSteps = currentSection?.steps || [];
  const stepIndex = currentSteps.findIndex(step => step.id === stepId);
  if (stepIndex >= currentSteps.length - 1) {
    return stepId;
  }
  return currentSteps[stepIndex + 1]?.id;
}

export const selectSelectedStep = (state, props, payload) => {
  return state.sections.find(section => section.id === state.selectedSectionId).steps.find(step => step.id === state.selectedStepId);
}

