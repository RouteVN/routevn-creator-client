import { constructPresentationState, constructRenderState } from 'route-engine-js'

export const INITIAL_STATE = Object.freeze({
  images: {},
  sceneId: undefined,
  scene: undefined,
  selectedLineId: undefined,
  sectionsGraphView: false,
  mode: 'lines-editor',
  selectedSectionId: '1',
  dropdownMenu: {
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [],
    sectionId: null,
    presentationType: null
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

export const setImages = (state, images) => {
  state.images = images;
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
    presentationType: null
  };
}

export const showPresentationDropdownMenu = (state, { position, presentationType }) => {
  state.dropdownMenu = {
    isOpen: true,
    position,
    items: [
      { label: 'Delete', type: 'item', value: 'delete-presentation' }
    ],
    sectionId: null,
    presentationType
  };
}

export const hideDropdownMenu = (state) => {
  state.dropdownMenu = {
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [],
    sectionId: null,
    presentationType: null
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

export const setLineTextContent = (state, { lineId, text }) => {
  const currentSection = state.scene.sections.find(section => section.id === state.selectedSectionId);
  if (!currentSection) {
    return
  };

  const line = currentSection.lines.find(line => line.id === lineId);
  if (!line) {
    return
  };

  if (!line.presentation) {
    line.presentation = {};
  }

  if (!line.presentation.dialogue) {
    line.presentation.dialogue = {};
  }

  line.presentation.dialogue.text = text;
}

export const selectRenderState = ({ state }) => {
  const currentSection = state.scene.sections.find(section => section.id === state.selectedSectionId);

  const linesUpToSelectedLine = currentSection?.lines?.slice(0, currentSection?.lines?.findIndex(line => line.id === state.selectedLineId) + 1);
  const presentationState = constructPresentationState(linesUpToSelectedLine.map(line => line.presentation));
  const renderState = constructRenderState({
    presentationState,
    screen: {
      width: 1920,
      height: 1080,
      backgroundColor: '#cccccc',
    },
    resolveFile: (f) => `file:${f}`,
    assets: {
      images: state.images
    },
    ui: {
      screens: {
        undefined: {
          name: "Dialogue Screen",
          elements: [
            {
              id: "dialogue-container",
              type: "container",
              x: 100,
              y: 100,
              children: [
                {
                  id: "dialogue-character-name",
                  type: "text",
                  text: "${dialogue.character.name}",
                  style: {
                    fontSize: 48,
                    fill: "white"
                  }
                },
                {
                  id: "dialogue-text",
                  type: "text",
                  y: 100,
                  text: "${dialogue.text}",
                  style: {
                    fontSize: 48,
                    fill: "white"
                  }
                }
              ]
            }
          ]
        }
      }
    },
  });
  return renderState;
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

  const selectedLine = currentSection?.lines?.find(line => line.id === state.selectedLineId);

  let backgroundImage;
  let bgmAudio;
  let soundEffectsAudio = [];
  let charactersData = [];

  if (selectedLine?.presentation?.background) {
    backgroundImage = state.repositoryState.images.items[selectedLine.presentation.background.imageId];
  }

  if (selectedLine?.presentation?.bgm) {
    bgmAudio = state.repositoryState.audio.items[selectedLine.presentation.bgm.audioId];
  }

  if (selectedLine?.presentation?.soundEffects) {
    soundEffectsAudio = selectedLine.presentation.soundEffects.map(se => ({
      ...se,
      audio: state.repositoryState.audio.items[se.audioId]
    }));
  }

  if (selectedLine?.presentation?.characters) {
    charactersData = selectedLine.presentation.characters.map(char => ({
      ...char,
      character: state.repositoryState.characters.items[char.characterId],
      sprite: char.spriteId ? state.repositoryState.images.items[char.spriteId] : null
    }));
  }

  let sceneTransitionData = null;
  if (selectedLine?.presentation?.sceneTransition) {
    const sceneTransition = selectedLine.presentation.sceneTransition;
    sceneTransitionData = {
      ...sceneTransition,
      scene: state.repositoryState.scenes.items[sceneTransition.sceneId]
    };
  }

  let richTextContent = '';
  if (selectedLine?.presentation?.richText) {
    // Check both possible text fields
    richTextContent = selectedLine.presentation.richText.content ||
      selectedLine.presentation.richText.text || '';
  } else if (selectedLine?.presentation?.dialogue) {
    // Fall back to dialogue text if rich text doesn't exist
    richTextContent = selectedLine.presentation.dialogue.text || '';
  }

  const soundEffectsNames = soundEffectsAudio.map(se => se.audio.name).join(", ");
  const charactersNames = charactersData.map(char => char.character?.name || 'Unknown').join(", ");

  return {
    scene: state.scene,
    sections,
    currentLines: Array.isArray(currentSection?.lines) ? currentSection.lines : [],
    currentLine: selectedLine,
    // currentLine: currentLines.find(line => line.id === state.selectedLineId),
    background: selectedLine?.presentation?.background,
    backgroundImage,
    bgm: selectedLine?.presentation?.bgm,
    bgmAudio,
    soundEffects: selectedLine?.presentation?.soundEffects,
    soundEffectsAudio,
    soundEffectsNames,
    characters: selectedLine?.presentation?.characters,
    charactersData,
    charactersNames,
    sceneTransition: selectedLine?.presentation?.sceneTransition,
    sceneTransitionData,
    richText: selectedLine?.presentation?.richText,
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
  const currentLines = Array.isArray(currentSection?.lines) ? currentSection.lines : [];
  const lineIndex = currentLines.findIndex(line => line.id === lineId);
  if (lineIndex === 0) {
    return lineId;
  }
  return currentLines[lineIndex - 1]?.id;
}

export const selectNextLineId = ({ state, props }, payload) => {
  const { lineId } = payload;
  const currentSection = state.scene.sections.find(section => section.id === state.selectedSectionId);
  const currentLines = Array.isArray(currentSection?.lines) ? currentSection.lines : [];
  const lineIndex = currentLines.findIndex(line => line.id === lineId);
  if (lineIndex >= currentLines.length - 1) {
    return lineId;
  }
  return currentLines[lineIndex + 1]?.id;
}

export const selectSelectedLine = (state, props, payload) => {
  return state.sections.find(section => section.id === state.selectedSectionId).lines.find(line => line.id === state.selectedLineId);
}

export const toggleSectionsGraphView = (state) => {
  state.sectionsGraphView = !state.sectionsGraphView;
}

