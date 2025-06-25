
export const INITIAL_STATE = Object.freeze({
  sceneId: undefined,
  scene: undefined,
  selectedStepId: undefined,
  sectionsGraphView: false,
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
    sectionId: null,
    instructionType: null
  },
  popover: {
    isOpen: false,
    position: { x: 0, y: 0 },
    sectionId: null
  },
  repositoryState: {},
});

export const setScene = (state, payload) => {
  const { id, scene } = payload;
  state.scene = scene;
  state.sceneId = id;
}

export const setRepository = (state, repository) => {
  state.repositoryState = repository;
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

export const selectSelectedStepId = ({ state, props }, payload) => {
  return state.selectedStepId;
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
    sectionId,
    instructionType: null
  };
}

export const showInstructionDropdownMenu = (state, { position, instructionType }) => {
  state.dropdownMenu = {
    isOpen: true,
    position,
    items: [
      { label: 'Delete', type: 'item', value: 'delete-instruction' }
    ],
    sectionId: null,
    instructionType
  };
}

export const hideDropdownMenu = (state) => {
  state.dropdownMenu = {
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [],
    sectionId: null,
    instructionType: null
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

  const selectedStep = currentSection?.steps.find(step => step.id === state.selectedStepId);

  let backgroundImage;
  let bgmAudio;
  let soundEffectsAudio = [];
  let charactersData = [];

  if (selectedStep?.instructions?.presentationInstructions?.background) {
    backgroundImage = state.repositoryState.images.items[selectedStep.instructions.presentationInstructions.background.imageId];
  }

  if (selectedStep?.instructions?.presentationInstructions?.bgm) {
    bgmAudio = state.repositoryState.audio.items[selectedStep.instructions.presentationInstructions.bgm.audioId];
  }

  if (selectedStep?.instructions?.presentationInstructions?.soundEffects) {
    soundEffectsAudio = selectedStep.instructions.presentationInstructions.soundEffects.map(se => ({
      ...se,
      audio: state.repositoryState.audio.items[se.audioId]
    }));
  }

  if (selectedStep?.instructions?.presentationInstructions?.characters) {
    charactersData = selectedStep.instructions.presentationInstructions.characters.map(char => ({
      ...char,
      character: state.repositoryState.characters.items[char.characterId],
      sprite: char.spriteId ? state.repositoryState.images.items[char.spriteId] : null
    }));
  }

  let sceneTransitionData = null;
  if (selectedStep?.instructions?.presentationInstructions?.sceneTransition) {
    const sceneTransition = selectedStep.instructions.presentationInstructions.sceneTransition;
    sceneTransitionData = {
      ...sceneTransition,
      scene: state.repositoryState.scenes.items[sceneTransition.sceneId]
    };
  }

  let richTextContent = '';
  if (selectedStep?.instructions?.presentationInstructions?.richText) {
    // Check both possible text fields
    richTextContent = selectedStep.instructions.presentationInstructions.richText.content || 
                     selectedStep.instructions.presentationInstructions.richText.text || '';
  } else if (selectedStep?.instructions?.presentationInstructions?.dialogue) {
    // Fall back to dialogue text if rich text doesn't exist
    richTextContent = selectedStep.instructions.presentationInstructions.dialogue.text || '';
  }

  const soundEffectsNames = soundEffectsAudio.map(se => se.audio.name).join(", ");
  const charactersNames = charactersData.map(char => char.character?.name || 'Unknown').join(", ");

  return {
    scene: state.scene,
    sections,
    currentSteps: currentSection?.steps || [],
    currentInstructions: [],
    currentStep: selectedStep,
    // currentStep: currentSteps.find(step => step.id === state.selectedStepId),
    background: selectedStep?.instructions?.presentationInstructions?.background,
    backgroundImage,
    bgm: selectedStep?.instructions?.presentationInstructions?.bgm,
    bgmAudio,
    soundEffects: selectedStep?.instructions?.presentationInstructions?.soundEffects,
    soundEffectsAudio,
    soundEffectsNames,
    characters: selectedStep?.instructions?.presentationInstructions?.characters,
    charactersData,
    charactersNames,
    sceneTransition: selectedStep?.instructions?.presentationInstructions?.sceneTransition,
    sceneTransitionData,
    richText: selectedStep?.instructions?.presentationInstructions?.richText,
    richTextContent,
    mode: state.mode,
    dropdownMenu: state.dropdownMenu,
    popover: state.popover,
    form: renameForm,
    selectedStepId: state.selectedStepId,
    sectionsGraphView: state.sectionsGraphView,
  };
}

export const selectStepIdIndex = (state, props, payload) => {
  const { stepId } = payload;
  return state.currentSteps.findIndex(step => step.id === stepId);
}

export const selectPreviousStepId = ({ state, props }, payload) => {
  const { stepId } = payload;
  const currentSection = state.scene.sections.find(section => section.id === state.selectedSectionId);
  const currentSteps = Array.isArray(currentSection?.steps) ? currentSection.steps : [];
  const stepIndex = currentSteps.findIndex(step => step.id === stepId);
  if (stepIndex === 0) {
    return stepId;
  }
  return currentSteps[stepIndex - 1]?.id;
}

export const selectNextStepId = ({ state, props }, payload) => {
  const { stepId } = payload;
  const currentSection = state.scene.sections.find(section => section.id === state.selectedSectionId);
  const currentSteps = Array.isArray(currentSection?.steps) ? currentSection.steps : [];
  const stepIndex = currentSteps.findIndex(step => step.id === stepId);
  if (stepIndex >= currentSteps.length - 1) {
    return stepId;
  }
  return currentSteps[stepIndex + 1]?.id;
}

export const selectSelectedStep = (state, props, payload) => {
  return state.sections.find(section => section.id === state.selectedSectionId).steps.find(step => step.id === state.selectedStepId);
}

export const toggleSectionsGraphView = (state) => {
  state.sectionsGraphView = !state.sectionsGraphView;
}

