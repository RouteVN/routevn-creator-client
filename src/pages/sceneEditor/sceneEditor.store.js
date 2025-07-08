
export const INITIAL_STATE = Object.freeze({
  sceneId: undefined,
  scene: undefined,
  selectedLineId: undefined,
  sectionsGraphView: false,
  currentInstructions: [{
    id: '1',
    instructions: {
      presentationInstructions: {},
    }
  }],
  mode: 'lines-editor',
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

export const selectSelectedLineId = ({ state, props }, payload) => {
  return state.selectedLineId;
}

export const setSelectedLineId = (state, selectedLineId) => {
  state.selectedLineId = selectedLineId;
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
  // const currentLine = selectSelectedLine(state, props, payload)

  const sections = state.scene.sections.map(section => {
    return {
      ...section,
      bgc: section.id === state.selectedSectionId ? 'mu' : '',
    }
  })

  // const currentLines = state.sections.find(section => section.id === state.selectedSectionId).lines;

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

  const selectedLine = currentSection?.steps?.find(line => line.id === state.selectedLineId);

  let backgroundImage;
  let bgmAudio;
  let soundEffectsAudio = [];
  let charactersData = [];

  if (selectedLine?.instructions?.presentationInstructions?.background) {
    backgroundImage = state.repositoryState.images.items[selectedLine.instructions.presentationInstructions.background.imageId];
  }

  if (selectedLine?.instructions?.presentationInstructions?.bgm) {
    bgmAudio = state.repositoryState.audio.items[selectedLine.instructions.presentationInstructions.bgm.audioId];
  }

  if (selectedLine?.instructions?.presentationInstructions?.soundEffects) {
    soundEffectsAudio = selectedLine.instructions.presentationInstructions.soundEffects.map(se => ({
      ...se,
      audio: state.repositoryState.audio.items[se.audioId]
    }));
  }

  if (selectedLine?.instructions?.presentationInstructions?.characters) {
    charactersData = selectedLine.instructions.presentationInstructions.characters.map(char => ({
      ...char,
      character: state.repositoryState.characters.items[char.characterId],
      sprite: char.spriteId ? state.repositoryState.images.items[char.spriteId] : null
    }));
  }

  let sceneTransitionData = null;
  if (selectedLine?.instructions?.presentationInstructions?.sceneTransition) {
    const sceneTransition = selectedLine.instructions.presentationInstructions.sceneTransition;
    sceneTransitionData = {
      ...sceneTransition,
      scene: state.repositoryState.scenes.items[sceneTransition.sceneId]
    };
  }

  let richTextContent = '';
  if (selectedLine?.instructions?.presentationInstructions?.richText) {
    // Check both possible text fields
    richTextContent = selectedLine.instructions.presentationInstructions.richText.content || 
                     selectedLine.instructions.presentationInstructions.richText.text || '';
  } else if (selectedLine?.instructions?.presentationInstructions?.dialogue) {
    // Fall back to dialogue text if rich text doesn't exist
    richTextContent = selectedLine.instructions.presentationInstructions.dialogue.text || '';
  }

  const soundEffectsNames = soundEffectsAudio.map(se => se.audio.name).join(", ");
  const charactersNames = charactersData.map(char => char.character?.name || 'Unknown').join(", ");

  return {
    scene: state.scene,
    sections,
    currentLines: Array.isArray(currentSection?.steps) ? currentSection.steps : [],
    currentInstructions: [],
    currentLine: selectedLine,
    // currentLine: currentLines.find(line => line.id === state.selectedLineId),
    background: selectedLine?.instructions?.presentationInstructions?.background,
    backgroundImage,
    bgm: selectedLine?.instructions?.presentationInstructions?.bgm,
    bgmAudio,
    soundEffects: selectedLine?.instructions?.presentationInstructions?.soundEffects,
    soundEffectsAudio,
    soundEffectsNames,
    characters: selectedLine?.instructions?.presentationInstructions?.characters,
    charactersData,
    charactersNames,
    sceneTransition: selectedLine?.instructions?.presentationInstructions?.sceneTransition,
    sceneTransitionData,
    richText: selectedLine?.instructions?.presentationInstructions?.richText,
    richTextContent,
    mode: state.mode,
    dropdownMenu: state.dropdownMenu,
    popover: state.popover,
    form: renameForm,
    selectedLineId: state.selectedLineId,
    sectionsGraphView: state.sectionsGraphView,
  };
}

export const selectLineIdIndex = (state, props, payload) => {
  const { lineId } = payload;
  return state.currentLines.findIndex(line => line.id === lineId);
}

export const selectPreviousLineId = ({ state, props }, payload) => {
  const { lineId } = payload;
  const currentSection = state.scene.sections.find(section => section.id === state.selectedSectionId);
  const currentLines = Array.isArray(currentSection?.steps) ? currentSection.steps : [];
  const lineIndex = currentLines.findIndex(line => line.id === lineId);
  if (lineIndex === 0) {
    return lineId;
  }
  return currentLines[lineIndex - 1]?.id;
}

export const selectNextLineId = ({ state, props }, payload) => {
  const { lineId } = payload;
  const currentSection = state.scene.sections.find(section => section.id === state.selectedSectionId);
  const currentLines = Array.isArray(currentSection?.steps) ? currentSection.steps : [];
  const lineIndex = currentLines.findIndex(line => line.id === lineId);
  if (lineIndex >= currentLines.length - 1) {
    return lineId;
  }
  return currentLines[lineIndex + 1]?.id;
}

export const selectSelectedLine = (state, props, payload) => {
  return state.sections.find(section => section.id === state.selectedSectionId).steps.find(line => line.id === state.selectedLineId);
}

export const toggleSectionsGraphView = (state) => {
  state.sectionsGraphView = !state.sectionsGraphView;
}

