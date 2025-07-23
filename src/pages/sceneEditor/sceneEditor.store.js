import {
  constructPresentationState,
  constructRenderState,
} from "route-engine-js";
import { toFlatItems, toTreeStructure } from "../../deps/repository";
import { layoutTreeStructureToRenderState } from "../../utils/index.js";

export const INITIAL_STATE = Object.freeze({
  sceneId: undefined,
  selectedLineId: undefined,
  sectionsGraphView: false,
  mode: "lines-editor",
  selectedSectionId: "1",
  dropdownMenu: {
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [],
    sectionId: null,
    presentationType: null,
  },
  popover: {
    isOpen: false,
    position: { x: 0, y: 0 },
    sectionId: null,
  },
  repositoryState: {},
});

export const setSceneId = (state, sceneId) => {
  state.sceneId = sceneId;
};

export const setRepositoryState = (state, repository) => {
  state.repositoryState = repository;
};

// Repository selectors
export const selectRepositoryState = ({ state }) => {
  return state.repositoryState;
};

export const selectImages = ({ state }) => {
  return state.repositoryState.images?.items || {};
};

export const selectAudios = ({ state }) => {
  return state.repositoryState.audio?.items || {};
};

export const selectCharacters = ({ state }) => {
  const characters = state.repositoryState.characters?.items || {};
  const processedCharacters = {};

  Object.keys(characters).forEach((characterId) => {
    const character = characters[characterId];
    if (character.type === "character") {
      processedCharacters[characterId] = {
        variables: {
          name: character.name || "Unnamed Character",
        },
        spriteParts: {},
      };

      // Process sprite parts if they exist
      if (character.sprites && character.sprites.items) {
        Object.keys(character.sprites.items).forEach((spriteId) => {
          const sprite = character.sprites.items[spriteId];
          if (sprite.fileId) {
            processedCharacters[characterId].spriteParts[spriteId] = {
              fileId: sprite.fileId,
            };
          }
        });
      }
    }
  });

  return processedCharacters;
};

export const selectPlacements = ({ state }) => {
  const placements = state.repositoryState.placements?.items || {};
  const processedPlacements = {};

  Object.keys(placements).forEach((placementId) => {
    const placement = placements[placementId];
    if (placement.type === "placement") {
      processedPlacements[placementId] = placement;
    }
  });

  return processedPlacements;
};

export const selectLayouts = ({ state }) => {
  const layouts = state.repositoryState.layouts?.items || {};
  const images = selectImages({ state });
  const processedLayouts = {};

  Object.keys(layouts).forEach((layoutId) => {
    const layout = layouts[layoutId];
    if (layout.type === "layout") {
      processedLayouts[layoutId] = {
        name: layout.name,
        elements: layoutTreeStructureToRenderState(
          toTreeStructure(layout.elements),
          images,
        ),
      };
    }
  });

  return processedLayouts;
};

export const selectScene = ({ state }) => {
  if (!state.sceneId || !state.repositoryState.scenes) {
    return null;
  }
  
  const scene = toFlatItems(state.repositoryState.scenes)
    .filter((item) => item.type === "scene")
    .find((item) => item.id === state.sceneId);
    
  if (!scene) {
    return null;
  }
  
  // Process sections and lines to flat structure
  const processedScene = {
    ...scene,
    sections: toFlatItems(scene.sections).map((section) => ({
      ...section,
      lines: toFlatItems(section.lines),
    })),
  };
  
  return processedScene;
};

export const selectSceneId = ({ state, props }, payload) => {
  return state.sceneId;
};

export const selectSelectedSectionId = ({ state, props }, payload) => {
  return state.selectedSectionId;
};

export const selectSelectedLineId = ({ state, props }, payload) => {
  return state.selectedLineId;
};

export const setSelectedLineId = (state, selectedLineId) => {
  state.selectedLineId = selectedLineId;
};

export const setMode = (state, mode) => {
  state.mode = mode;
};

export const setSelectedSectionId = (state, selectedSectionId) => {
  state.selectedSectionId = selectedSectionId;
};

export const showSectionDropdownMenu = (state, { position, sectionId }) => {
  state.dropdownMenu = {
    isOpen: true,
    position,
    items: [
      { label: "Rename", type: "item", value: "rename-section" },
      { label: "Delete", type: "item", value: "delete-section" },
    ],
    sectionId,
    presentationType: null,
  };
};

export const showPresentationDropdownMenu = (
  state,
  { position, presentationType },
) => {
  state.dropdownMenu = {
    isOpen: true,
    position,
    items: [{ label: "Delete", type: "item", value: "delete-presentation" }],
    sectionId: null,
    presentationType,
  };
};

export const hideDropdownMenu = (state) => {
  state.dropdownMenu = {
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [],
    sectionId: null,
    presentationType: null,
  };
};

export const showPopover = (state, { position, sectionId }) => {
  state.popover = {
    isOpen: true,
    position,
    sectionId,
  };
};

export const hidePopover = (state) => {
  state.popover = {
    isOpen: false,
    position: { x: 0, y: 0 },
    sectionId: null,
  };
};

export const setLineTextContent = (state, { lineId, text }) => {
  const scene = selectScene({ state });
  if (!scene) return;
  
  const currentSection = scene.sections.find(
    (section) => section.id === state.selectedSectionId,
  );
  if (!currentSection) {
    return;
  }

  const line = currentSection.lines.find((line) => line.id === lineId);
  if (!line) {
    return;
  }

  if (!line.presentation) {
    line.presentation = {};
  }

  if (!line.presentation.dialogue) {
    line.presentation.dialogue = {};
  }

  line.presentation.dialogue.text = text;
};

export const selectRenderState = ({ state }) => {
  const scene = selectScene({ state });
  if (!scene) return null;
  
  const currentSection = scene.sections.find(
    (section) => section.id === state.selectedSectionId,
  );

  const linesUpToSelectedLine = currentSection?.lines?.slice(
    0,
    currentSection?.lines?.findIndex(
      (line) => line.id === state.selectedLineId,
    ) + 1,
  );
  console.log("linesUpToSelectedLine", linesUpToSelectedLine);
  const presentationState = constructPresentationState(
    linesUpToSelectedLine.map((line) =>
      JSON.parse(JSON.stringify(line.presentation)),
    ),
  );
  console.log("presentationState", presentationState);
  const renderState = constructRenderState({
    presentationState,
    screen: {
      width: 1920,
      height: 1080,
      backgroundColor: "#cccccc",
    },
    resolveFile: (f) => `file:${f}`,
    assets: {
      images: selectImages({ state }),
      transforms: selectPlacements({ state }),
      characters: selectCharacters({ state }),
      audios: selectAudios({ state }),
    },
    ui: {
      layouts: selectLayouts({ state }),
    },
  });
  console.log("renderState", renderState);
  return renderState;
};

export const toViewData = ({ state, props }, payload) => {
  // const currentLine = selectSelectedLine(state, props, payload)
  const scene = selectScene({ state });
  if (!scene) {
    return {
      scene: null,
      sections: [],
      currentLines: [],
      currentLine: null,
      mode: state.mode,
      dropdownMenu: state.dropdownMenu,
      popover: state.popover,
      selectedLineId: state.selectedLineId,
      sectionsGraphView: state.sectionsGraphView,
    };
  }

  const sections = scene.sections.map((section) => {
    return {
      ...section,
      bgc: section.id === state.selectedSectionId ? "mu" : "",
    };
  });

  // const currentLines = state.sections.find(section => section.id === state.selectedSectionId).lines;

  // Get current section for rename form
  const currentSection = scene.sections.find(
    (section) => section.id === state.selectedSectionId,
  );

  // Form configuration for renaming
  const renameForm = currentSection
    ? {
        fields: [
          {
            name: "name",
            inputType: "inputText",
            label: "Section Name",
            value: currentSection.name || "",
            required: true,
          },
        ],
        actions: {
          layout: "",
          buttons: [
            {
              id: "submit",
              variant: "pr",
              content: "Rename",
            },
            {
              id: "cancel",
              variant: "se",
              content: "Cancel",
            },
          ],
        },
      }
    : null;

  const selectedLine = currentSection?.lines?.find(
    (line) => line.id === state.selectedLineId,
  );

  let backgroundImage;
  let bgmAudio;
  let soundEffectsAudio = [];
  let charactersData = [];

  const repositoryState = selectRepositoryState({ state });
  const images = selectImages({ state });
  const audios = selectAudios({ state });

  if (selectedLine?.presentation?.background) {
    backgroundImage = images[selectedLine.presentation.background.imageId];
  }

  if (selectedLine?.presentation?.bgm) {
    bgmAudio = audios[selectedLine.presentation.bgm.audioId];
  }

  if (selectedLine?.presentation?.soundEffects) {
    soundEffectsAudio = selectedLine.presentation.soundEffects.map((se) => ({
      ...se,
      audio: audios[se.audioId],
    }));
  }

  if (selectedLine?.presentation?.character?.items) {
    charactersData = selectedLine.presentation.character.items.map((char) => {
      const character = repositoryState.characters?.items?.[char.id];
      let sprite = null;

      if (char.spriteParts?.[0]?.spritePartId && character?.sprites) {
        // Look up sprite from character's sprites
        const spriteId = char.spriteParts[0].spritePartId;
        const flatSprites = toFlatItems(character.sprites);
        sprite = flatSprites.find((s) => s.id === spriteId);
      }

      return {
        ...char,
        character,
        sprite,
      };
    });
  }

  let sceneTransitionData = null;
  if (selectedLine?.presentation?.sceneTransition) {
    const sceneTransition = selectedLine.presentation.sceneTransition;
    sceneTransitionData = {
      ...sceneTransition,
      scene: repositoryState.scenes?.items?.[sceneTransition.sceneId],
    };
  }

  let richTextContent = "";
  if (selectedLine?.presentation?.richText) {
    // Check both possible text fields
    richTextContent =
      selectedLine.presentation.richText.content ||
      selectedLine.presentation.richText.text ||
      "";
  } else if (selectedLine?.presentation?.dialogue) {
    // Fall back to dialogue text if rich text doesn't exist
    richTextContent = selectedLine.presentation.dialogue.text || "";
  }

  const soundEffectsNames = soundEffectsAudio
    .map((se) => se.audio.name)
    .join(", ");
  const charactersNames = charactersData
    .map((char) => char.character?.name || "Unknown")
    .join(", ");

  console.log("selectedLine", selectedLine);

  return {
    scene: scene,
    sections,
    currentLines: Array.isArray(currentSection?.lines)
      ? currentSection.lines
      : [],
    currentLine: selectedLine,
    // currentLine: currentLines.find(line => line.id === state.selectedLineId),
    background: selectedLine?.presentation?.background,
    backgroundImage,
    layout: selectedLine?.presentation?.layout,
    layoutData: selectedLine?.presentation?.layout
      ? toFlatItems(repositoryState.layouts).find(
          (l) => l.id === selectedLine?.presentation?.layout?.layoutId,
        )
      : null,
    bgm: selectedLine?.presentation?.bgm,
    bgmAudio,
    soundEffects: selectedLine?.presentation?.soundEffects,
    soundEffectsAudio,
    soundEffectsNames,
    characters: selectedLine?.presentation?.character?.items,
    charactersData,
    charactersNames,
    sceneTransition: selectedLine?.presentation?.sceneTransition,
    sceneTransitionData,
    dialogue: selectedLine?.presentation?.dialogue,
    dialogueData: selectedLine?.presentation?.dialogue
      ? toFlatItems(repositoryState.layouts).find(
          (l) => l.id === selectedLine?.presentation?.dialogue?.layoutId,
        )
      : null,
    dialogueCharacterData: selectedLine?.presentation?.dialogue?.characterId
      ? repositoryState.characters?.items?.[
          selectedLine.presentation.dialogue.characterId
        ]
      : null,
    richText: selectedLine?.presentation?.richText,
    richTextContent,
    mode: state.mode,
    dropdownMenu: state.dropdownMenu,
    popover: state.popover,
    form: renameForm,
    selectedLineId: state.selectedLineId,
    selectedLine,
    sectionsGraphView: state.sectionsGraphView,
    layouts: Object.entries(selectLayouts({ state })).map(([id, item]) => ({
      id,
      ...item,
    })),
    allCharacters: Object.entries(repositoryState.characters?.items || {}).map(
      ([id, item]) => ({
        id,
        ...item,
      }),
    ),
  };
};

export const selectLineIdIndex = (state, props, payload) => {
  const { lineId } = payload;
  return state.currentLines.findIndex((line) => line.id === lineId);
};

export const selectPreviousLineId = ({ state, props }, payload) => {
  const { lineId } = payload;
  const scene = selectScene({ state });
  if (!scene) return lineId;
  
  const currentSection = scene.sections.find(
    (section) => section.id === state.selectedSectionId,
  );
  const currentLines = Array.isArray(currentSection?.lines)
    ? currentSection.lines
    : [];
  const lineIndex = currentLines.findIndex((line) => line.id === lineId);
  if (lineIndex === 0) {
    return lineId;
  }
  return currentLines[lineIndex - 1]?.id;
};

export const selectNextLineId = ({ state, props }, payload) => {
  const { lineId } = payload;
  const scene = selectScene({ state });
  if (!scene) return lineId;
  
  const currentSection = scene.sections.find(
    (section) => section.id === state.selectedSectionId,
  );
  const currentLines = Array.isArray(currentSection?.lines)
    ? currentSection.lines
    : [];
  const lineIndex = currentLines.findIndex((line) => line.id === lineId);
  if (lineIndex >= currentLines.length - 1) {
    return lineId;
  }
  return currentLines[lineIndex + 1]?.id;
};

export const selectSelectedLine = (state, props, payload) => {
  const scene = selectScene({ state });
  if (!scene) return null;
  
  return scene.sections
    .find((section) => section.id === state.selectedSectionId)
    ?.lines.find((line) => line.id === state.selectedLineId);
};

export const toggleSectionsGraphView = (state) => {
  state.sectionsGraphView = !state.sectionsGraphView;
};
