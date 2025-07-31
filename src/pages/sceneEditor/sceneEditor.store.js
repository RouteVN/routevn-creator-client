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

  const selectedLineIndex = currentSection?.lines?.findIndex(
    (line) => line.id === state.selectedLineId,
  );

  // If selected line not found, default to all lines
  const endIndex =
    selectedLineIndex !== -1
      ? selectedLineIndex + 1
      : currentSection?.lines?.length || 0;
  const linesUpToSelectedLine = currentSection?.lines?.slice(0, endIndex) || [];

  const presentationState = constructPresentationState(
    linesUpToSelectedLine.map((line) =>
      JSON.parse(JSON.stringify(line.presentation)),
    ),
  );
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

  // Debug logging
  if (!selectedLine && state.selectedLineId) {
    console.warn("Selected line not found:", {
      selectedLineId: state.selectedLineId,
      availableLineIds: currentSection?.lines?.map((line) => line.id) || [],
      currentSectionId: state.selectedSectionId,
    });
  }

  const repositoryState = selectRepositoryState({ state });

  console.log("selectedLine", selectedLine);

  return {
    scene: scene,
    sections,
    currentLines: Array.isArray(currentSection?.lines)
      ? currentSection.lines
      : [],
    presentationData: selectPresentationData({ state }),
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
    sectionsGraph: JSON.stringify(
      selectSectionTransitionsDAG({ state }),
      null,
      2,
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

export const selectPresentationData = ({ state }) => {
  const scene = selectScene({ state });
  if (!scene) return [];

  const currentSection = scene.sections.find(
    (section) => section.id === state.selectedSectionId,
  );

  const selectedLine = currentSection?.lines?.find(
    (line) => line.id === state.selectedLineId,
  );

  if (!selectedLine?.presentation) {
    console.log(
      "[sceneEditor] No presentation data found for selected line:",
      selectedLine,
    );
    return [];
  }

  console.log(
    "[sceneEditor] Processing presentation data:",
    selectedLine.presentation,
  );

  const repositoryState = selectRepositoryState({ state });
  const images = selectImages({ state });
  const audios = selectAudios({ state });

  const presentationItems = [];

  // Background
  if (selectedLine.presentation.background) {
    const backgroundImage =
      images[selectedLine.presentation.background.resourceId];
    if (backgroundImage) {
      presentationItems.push({
        type: "background",
        id: "presentation-action-background",
        dataMode: "background",
        icon: "image",
        data: {
          backgroundImage,
        },
      });
    }
  }

  // Layout
  if (selectedLine.presentation.layout) {
    const layoutData = toFlatItems(repositoryState.layouts).find(
      (l) => l.id === selectedLine.presentation.layout.layoutId,
    );
    if (layoutData) {
      presentationItems.push({
        type: "layout",
        id: "presentation-action-layout",
        dataMode: "layout",
        icon: "layout",
        data: {
          layoutData,
        },
      });
    }
  }

  // BGM
  if (selectedLine.presentation.bgm) {
    const bgmAudio = audios[selectedLine.presentation.bgm.resourceId];
    if (bgmAudio) {
      presentationItems.push({
        type: "bgm",
        id: "presentation-action-bgm",
        dataMode: "bgm",
        icon: "music",
        data: {
          bgmAudio: {
            fileId: bgmAudio.fileId,
            name: bgmAudio.name,
          },
        },
      });
    }
  }

  // Sound Effects
  if (selectedLine.presentation.soundEffects) {
    const soundEffectsAudio = selectedLine.presentation.soundEffects.map(
      (sfx) => ({
        ...sfx,
        audio: audios[sfx.resourceId],
      }),
    );
    const soundEffectsNames = soundEffectsAudio
      .map((sfx) => sfx.audio?.name || "Unknown")
      .filter((name) => name !== "Unknown")
      .join(", ");

    presentationItems.push({
      type: "sfx",
      id: "presentation-action-sfx",
      dataMode: "sfx",
      icon: "audio",
      data: {
        soundEffectsAudio,
        soundEffectsNames,
      },
    });
  }

  // Characters
  if (selectedLine.presentation.character?.items) {
    const charactersData = selectedLine.presentation.character.items.map(
      (char) => {
        const character = repositoryState.characters?.items?.[char.id];
        let sprite = null;

        if (char.spriteParts?.[0]?.spritePartId && character?.sprites) {
          const spriteId = char.spriteParts[0].spritePartId;
          const flatSprites = toFlatItems(character.sprites);
          sprite = flatSprites.find((s) => s.id === spriteId);
        }

        return {
          ...char,
          character,
          sprite,
        };
      },
    );

    const charactersNames = charactersData
      .map((char) => char.character?.name || "Unknown")
      .join(", ");

    presentationItems.push({
      type: "characters",
      id: "presentation-action-characters",
      dataMode: "characters",
      icon: "character",
      data: {
        charactersData,
        charactersNames,
      },
    });
  }

  // Transition (Scene or Section)
  // Handle both nested and non-nested structures
  const sectionTransitionData =
    selectedLine.presentation.sectionTransition ||
    selectedLine.presentation.presentation?.sectionTransition;
  if (sectionTransitionData) {
    const transition = sectionTransitionData;
    console.log("[sceneEditor] Found sectionTransition:", transition);

    if (transition.sceneId) {
      // Scene Transition
      console.log(
        "[sceneEditor] Processing scene transition with sceneId:",
        transition.sceneId,
      );
      console.log(
        "[sceneEditor] Available scenes:",
        repositoryState.scenes?.items,
      );

      const targetScene = toFlatItems(repositoryState.scenes || []).find(
        (scene) => scene.id === transition.sceneId,
      );
      console.log("[sceneEditor] Found target scene:", targetScene);

      const sceneTransitionData = {
        ...transition,
        scene: targetScene,
      };

      presentationItems.push({
        type: "sceneTransition",
        id: "presentation-action-scene",
        dataMode: "sceneTransition",
        icon: "scene",
        data: {
          sceneTransitionData,
        },
      });
      console.log("[sceneEditor] Added scene transition to presentationItems");
    } else if (transition.sectionId) {
      // Section Transition
      const scene = selectScene({ state });
      const targetSection = scene?.sections?.find(
        (section) => section.id === transition.sectionId,
      );

      const sectionTransitionData = {
        ...transition,
        section: targetSection,
      };

      presentationItems.push({
        type: "sectionTransition",
        id: "presentation-action-section",
        dataMode: "sectiontransition",
        icon: "section",
        data: {
          sectionTransitionData,
        },
      });
    }
  }

  // Dialogue
  if (selectedLine.presentation.dialogue) {
    const dialogueData = toFlatItems(repositoryState.layouts).find(
      (l) => l.id === selectedLine.presentation.dialogue.layoutId,
    );
    const dialogueCharacterData = selectedLine.presentation.dialogue.characterId
      ? repositoryState.characters?.items?.[
          selectedLine.presentation.dialogue.characterId
        ]
      : null;

    presentationItems.push({
      type: "dialogue",
      id: "presentation-action-dialogue",
      dataMode: "dialoguebox",
      icon: "dialogue",
      data: {
        dialogueData,
        dialogueCharacterData,
      },
    });
  }

  // Choices
  // Handle both nested and non-nested structures
  const choicesData =
    selectedLine.presentation.choices ||
    selectedLine.presentation.presentation?.choices;
  if (choicesData) {
    const layoutData = choicesData.layoutId
      ? toFlatItems(repositoryState.layouts).find(
          (l) => l.id === choicesData.layoutId,
        )
      : null;

    presentationItems.push({
      type: "choices",
      id: "presentation-action-choices",
      dataMode: "choices",
      icon: "choices",
      data: {
        choicesData,
        layoutData,
      },
    });
  }

  console.log("[sceneEditor] Final presentationItems:", presentationItems);
  return presentationItems;
};

export const toggleSectionsGraphView = (state) => {
  state.sectionsGraphView = !state.sectionsGraphView;
};

export const selectSectionTransitionsDAG = ({ state }) => {
  const currentScene = selectScene({ state });

  if (!currentScene) {
    return { nodes: [], edges: [], adjacencyList: {} };
  }

  const nodes = [];
  const edges = [];

  // Add all sections from current scene as nodes
  currentScene.sections.forEach((section) => {
    nodes.push({
      id: section.id,
      sceneId: currentScene.id,
      sceneName: currentScene.name,
      sectionName: section.name,
      type: "section",
    });

    // Check all lines in this section for section transitions within current scene
    if (section.lines) {
      section.lines.forEach((line) => {
        const sectionTransition = line.presentation?.sectionTransition;

        if (sectionTransition && sectionTransition.sectionId) {
          // Only include transitions to other sections within the same scene
          const targetSection = currentScene.sections.find(
            (s) => s.id === sectionTransition.sectionId,
          );

          if (targetSection) {
            edges.push({
              from: section.id,
              to: sectionTransition.sectionId,
              type: "section",
              animation: sectionTransition.animation || "fade",
              lineId: line.id,
            });
          }
        }
      });
    }
  });

  // Create adjacency list for easier graph traversal
  const adjacencyList = {};
  nodes.forEach((node) => {
    adjacencyList[node.id] = {
      node,
      outgoing: edges.filter((edge) => edge.from === node.id),
      incoming: edges.filter((edge) => edge.to === node.id),
    };
  });

  return {
    nodes,
    edges,
    adjacencyList,
  };
};
