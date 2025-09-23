import {
  constructPresentationState,
  constructRenderState,
} from "route-engine-js";
import { toFlatItems, toTreeStructure } from "../../deps/repository";
import { layoutTreeStructureToRenderState } from "../../utils/index.js";
import { constructResources } from "../../utils/resourcesConstructor.js";

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

export const selectFonts = ({ state }) => {
  return state.repositoryState.fonts?.items || {};
};

export const selectImages = ({ state }) => {
  return state.repositoryState.images?.items || {};
};

export const selectAudios = ({ state }) => {
  return state.repositoryState.audio?.items || {};
};

export const selectAnimations = ({ state }) => {
  const items = {};
  Object.entries(state.repositoryState.animations?.items || {}).forEach(
    ([id, item]) => {
      if (item.type === "animation") {
        items[id] = {
          id,
          properties: item.properties,
        };
      }
    },
  );
  return items;
};

export const selectCharacters = ({ state }) => {
  const characters = state.repositoryState.characters?.items || {};
  const processedCharacters = {};

  Object.keys(characters).forEach((characterId) => {
    const character = characters[characterId];
    if (character.type === "character") {
      processedCharacters[characterId] = {
        name: character.name,
        variables: {
          name: character.name || "Unnamed Character",
        },
        sprites: {},
      };

      // Process sprite parts if they exist
      if (character.sprites && character.sprites.items) {
        Object.keys(character.sprites.items).forEach((spriteId) => {
          const sprite = character.sprites.items[spriteId];
          if (sprite.fileId) {
            processedCharacters[characterId].sprites[spriteId] = {
              fileId: sprite.fileId,
            };
          }
        });
      }
    }
  });

  return processedCharacters;
};

export const selectTransforms = ({ state }) => {
  const transforms = state.repositoryState.transforms?.items || {};
  const processedTransforms = {};

  Object.keys(transforms).forEach((transformId) => {
    const transform = transforms[transformId];
    if (transform.type === "transform") {
      processedTransforms[transformId] = transform;
    }
  });

  return processedTransforms;
};

export const selectLayouts = ({ state }) => {
  const layouts = state.repositoryState.layouts?.items || {};
  const images = selectImages({ state });
  const typography = state.repositoryState.typography || {
    items: {},
    tree: [],
  };
  const colors = state.repositoryState.colors || { items: {}, tree: [] };
  const fonts = state.repositoryState.fonts || { items: {}, tree: [] };
  const processedLayouts = {};

  Object.keys(layouts).forEach((layoutId) => {
    const layout = layouts[layoutId];
    if (layout.type === "layout") {
      processedLayouts[layoutId] = {
        id: layoutId,
        name: layout.name,
        layoutType: layout.layoutType,
        elements: layoutTreeStructureToRenderState(
          toTreeStructure(layout.elements),
          images,
          typography,
          colors,
          fonts,
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
  const scene = selectScene({ state });
  const items = [{ label: "Rename", type: "item", value: "rename-section" }];

  // Only show delete option if there's more than 1 section
  if (scene && scene.sections && scene.sections.length > 1) {
    items.push({ label: "Delete", type: "item", value: "delete-section" });
  }

  state.dropdownMenu = {
    isOpen: true,
    position,
    items,
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

export const setLineTextContent = (state, { lineId, content }) => {
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

  line.presentation.dialogue.content = content;
};

export const selectPresentationState = ({ state }) => {
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

  return presentationState;
};

export const selectRenderState = ({ state }) => {
  const presentationState = selectPresentationState({ state });
  if (!presentationState) return null;

  const resources = constructResources(state.repositoryState);

  console.log("presentationState", presentationState);
  console.log("resources", resources);

  const renderState = constructRenderState({
    presentationState,
    screen: {
      width: 1920,
      height: 1080,
      backgroundColor: "#cccccc",
    },
    resolveFile: (f) => `file:${f}`,
    resources,
    i18n: {},
    systemState: {
      pendingEffects: [],
      variables: {},
      saveData: {},
      lastLineAction: undefined,
      dialogueUIHidden: false,
      autoMode: false,
      skipMode: false,
      currentLanguagePackId: "",
      history: {
        entries: [],
      },
      globalAudios: [],
      historyEntryIndex: undefined,
      currentMode: "main",
      nextConfig: {},
      modes: {
        main: {
          currentPointer: "read",
          modals: [],
          read: {
            sectionId: "",
            lineId: "",
          },
          history: {
            sectionId: undefined,
            lineId: undefined,
            historyEntryIndex: undefined,
          },
        },
        replay: {
          currentPointer: "read",
          modals: [],
          read: {
            sectionId: undefined,
            lineId: undefined,
          },
          history: {
            sectionId: undefined,
            lineId: undefined,
            historyEntryIndex: undefined,
          },
        },
      },
    },
    systemStore: {
      selectSaveDataPage: () => {},
      selectAutoMode: () => {},
      selectSkipMode: () => {},
      selectCurrentLanguagePackId: () => {},
      selectCurrentLanguagePackKeys: () => {},
    },
  });

  console.log("renderState", renderState);

  return renderState;
};

export const toViewData = ({ state, props }) => {
  const currentLine = selectSelectedLine({ state, props });
  const scene = selectScene({ state });
  if (!scene) {
    return {
      scene: null,
      sections: [],
      currentLines: [],
      currentLine: null,
      presentationData: [],
      presentationState: null,
      mode: state.mode,
      dropdownMenu: state.dropdownMenu,
      popover: state.popover,
      selectedLineId: state.selectedLineId,
      sectionsGraphView: state.sectionsGraphView,
      layouts: [],
      allCharacters: [],
      sectionsGraph: JSON.stringify(
        { nodes: [], edges: [], adjacencyList: {} },
        null,
        2,
      ),
      isActionsDialogOpen: state.mode !== "lines-editor",
    };
  }

  const sections = scene.sections.map((section) => {
    return {
      ...section,
      bgc: section.id === state.selectedSectionId ? "" : "mu",
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
  const presentationState = selectPresentationState({ state });

  return {
    scene: scene,
    sections,
    currentLines: Array.isArray(currentSection?.lines)
      ? currentSection.lines
      : [],
    presentationData: selectPresentationData({ state }),
    presentationState,
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
    isActionsDialogOpen: state.mode !== "lines-editor",
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

export const selectSelectedLine = ({ state }) => {
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
    return [];
  }

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
    const bgmAudio = audios[selectedLine.presentation.bgm.audioId];
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
  if (selectedLine.presentation.sfx?.items) {
    const soundEffectsAudio = selectedLine.presentation.sfx.items.map(
      (sfx) => ({
        ...sfx,
        audio: audios[sfx.audioId],
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

        if (char.sprites?.[0]?.imageId && character?.sprites) {
          const spriteId = char.sprites[0].imageId;
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
      dataMode: "character", // Use singular to match the property name in presentation object
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

    if (transition.sceneId) {
      // Scene Transition

      const targetScene = toFlatItems(repositoryState.scenes || []).find(
        (scene) => scene.id === transition.sceneId,
      );

      const sectionTransitionData = {
        ...transition,
        scene: targetScene,
      };

      presentationItems.push({
        type: "sectionTransition",
        id: "presentation-action-scene",
        dataMode: "sectionTransition", // Use sectionTransition as the property name in presentation object
        icon: "scene",
        data: {
          sectionTransitionData,
        },
      });
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
        dataMode: "sectionTransition",
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
      dataMode: "dialogue", // Use singular to match the property name in presentation object
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
    selectedLine.presentation.choice ||
    selectedLine.presentation.presentation?.choice;
  if (choicesData) {
    const layoutData = choicesData.layoutId
      ? toFlatItems(repositoryState.layouts).find(
          (l) => l.id === choicesData.layoutId,
        )
      : null;

    presentationItems.push({
      type: "choices",
      id: "presentation-action-choices",
      dataMode: "choice", // Use singular to match the property name in presentation object
      icon: "choices",
      data: {
        choicesData,
        layoutData,
      },
    });
  }

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
