import { toFlatItems, toTreeStructure } from "#insieme-compat";
import { layoutTreeStructureToRenderState } from "../../utils/index.js";
import { constructProjectData } from "../../utils/projectDataConstructor.js";
import { getSectionPresentation } from "../../utils/sectionPresentation.js";

export const createInitialState = () => ({
  sceneId: undefined,
  selectedLineId: undefined,
  sectionsGraphView: false,
  selectedSectionId: "1",
  sectionsOverviewPanel: {
    isOpen: false,
  },
  dropdownMenu: {
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [],
    sectionId: null,
    actionsType: null,
  },
  popover: {
    isOpen: false,
    position: { x: 0, y: 0 },
    sectionId: null,
  },
  repositoryState: {},
  previewVisible: false,
  previewSceneId: undefined,
  previewSectionId: undefined,
  previewLineId: undefined,
  presentationState: {},
  sectionLineChanges: {},
  isMuted: false,
  isSceneAssetLoading: false,
  lockingLineId: null, // Lock to prevent duplicate split/merge operations
  deadEndTooltip: {
    open: false,
    x: 0,
    y: 0,
    content: "",
  },
});

export const setSceneId = ({ state }, { sceneId } = {}) => {
  state.sceneId = sceneId;
};

export const setRepositoryState = ({ state }, { repository } = {}) => {
  state.repositoryState = repository;
};

export const showPreviewSceneId = ({ state }, { payload } = {}) => {
  const { sceneId, sectionId, lineId } = payload;
  state.previewVisible = true;
  state.previewSceneId = sceneId;
  state.previewSectionId = sectionId;
  state.previewLineId = lineId;
};

export const hidePreviewScene = ({ state }, _payload = {}) => {
  state.previewVisible = false;
  state.previewSectionId = undefined;
  state.previewLineId = undefined;
};

export const setPresentationState = ({ state }, { presentationState } = {}) => {
  state.presentationState = presentationState;
};

export const setSectionLineChanges = ({ state }, { changes } = {}) => {
  state.sectionLineChanges = changes;
};

export const setSceneAssetLoading = ({ state }, { isLoading } = {}) => {
  state.isSceneAssetLoading = isLoading;
};

export const selectIsSceneAssetLoading = ({ state }) => {
  return state.isSceneAssetLoading;
};

export const selectSectionLineChanges = ({ state }) => {
  return state.sectionLineChanges;
};

export const selectPreviewScene = ({ state }) => {
  return {
    previewVisible: state.previewVisible,
    previewSceneId: state.previewSceneId,
  };
};

// Repository selectors
export const selectRepositoryState = ({ state }) => {
  return state.repositoryState;
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

export const selectLayouts = ({ state }) => {
  const layouts = state.repositoryState.layouts?.items || {};
  const images = state.repositoryState.images?.items || {};
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

export const selectSceneId = ({ state }) => {
  return state.sceneId;
};

export const selectSelectedSectionId = ({ state }) => {
  return state.selectedSectionId;
};

export const selectSelectedLineId = ({ state }) => {
  return state.selectedLineId;
};

export const setSelectedLineId = ({ state }, { selectedLineId } = {}) => {
  state.selectedLineId = selectedLineId;
};

export const setSelectedSectionId = ({ state }, { selectedSectionId } = {}) => {
  state.selectedSectionId = selectedSectionId;
};

export const openSectionsOverviewPanel = ({ state }, _payload = {}) => {
  state.sectionsOverviewPanel.isOpen = true;
  state.deadEndTooltip.open = false;
};

export const closeSectionsOverviewPanel = ({ state }, _payload = {}) => {
  state.sectionsOverviewPanel.isOpen = false;
  state.deadEndTooltip.open = false;
};

export const selectIsSectionsOverviewOpen = ({ state }) => {
  return state.sectionsOverviewPanel.isOpen;
};

// Set lock to prevent duplicate split/merge operations on the same line
export const setLockingLineId = ({ state }, { lineId } = {}) => {
  state.lockingLineId = lineId;
};

// Clear lock after split/merge operation completes
export const clearLockingLineId = ({ state }, _payload = {}) => {
  state.lockingLineId = null;
};

// Get current locked line ID
export const selectLockingLineId = ({ state }) => {
  return state.lockingLineId;
};

export const showSectionDropdownMenu = (
  { state },
  { position, sectionId } = {},
) => {
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
    actionsType: null,
  };
};

export const showSectionsOverviewDropdownMenu = (
  { state },
  { position } = {},
) => {
  const scene = selectScene({ state });
  const items = (scene?.sections || []).map((section, index) => ({
    label: `${index + 1}. ${section.name || `Section ${index + 1}`}`,
    type: "item",
    value: `go-to-section:${section.id}`,
  }));

  state.dropdownMenu = {
    isOpen: true,
    position,
    items,
    sectionId: null,
    actionsType: null,
  };
};

export const showActionsDropdownMenu = (
  { state },
  { position, actionsType } = {},
) => {
  state.dropdownMenu = {
    isOpen: true,
    position,
    items: [{ label: "Delete", type: "item", value: "delete-actions" }],
    sectionId: null,
    actionsType,
  };
};

export const hideDropdownMenu = ({ state }, _payload = {}) => {
  state.dropdownMenu = {
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [],
    sectionId: null,
    actionsType: null,
  };
};

export const showPopover = ({ state }, { position, sectionId } = {}) => {
  state.popover = {
    isOpen: true,
    position,
    sectionId,
  };
};

export const hidePopover = ({ state }, _payload = {}) => {
  state.popover = {
    isOpen: false,
    position: { x: 0, y: 0 },
    sectionId: null,
  };
};

export const setLineTextContent = ({ state }, { lineId, content } = {}) => {
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

  if (!line.actions) {
    line.actions = {};
  }

  if (!line.actions.dialogue) {
    line.actions.dialogue = {};
  }

  line.actions.dialogue.content = content;
};

export const selectProjectData = ({ state }) => {
  return constructProjectData(state.repositoryState);
};

export const selectViewData = ({ state }) => {
  const scene = selectScene({ state });
  if (!scene) {
    return {
      scene: { id: "", name: "Scene", sections: [] },
      sections: [],
      sectionsOverviewOpen: false,
      sectionsOverviewItems: [],
      currentLines: [],
      currentLine: null,
      actionsData: [],
      presentationState: null,
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
      isSceneAssetLoading: state.isSceneAssetLoading,
      deadEndTooltip: state.deadEndTooltip,
    };
  }

  const repositoryState = selectRepositoryState({ state });
  const layouts = repositoryState.layouts || { items: {} };
  const selectedSceneFirstSectionId = scene.sections?.[0]?.id;
  const selectedSceneInitialSectionId =
    scene.initialSectionId || selectedSceneFirstSectionId;
  const menuSceneId = repositoryState.story?.initialSceneId;

  const sectionPresentationById = Object.fromEntries(
    scene.sections.map((section) => [
      section.id,
      getSectionPresentation({
        section,
        initialSectionId: selectedSceneInitialSectionId,
        layouts,
        menuSceneId,
      }),
    ]),
  );

  const sectionTransitionsDAG = selectSectionTransitionsDAG({ state });

  const sections = scene.sections.map((section) => {
    return {
      ...section,
      bgc: section.id === state.selectedSectionId ? "" : "mu",
      isDeadEnd: !!sectionPresentationById[section.id]?.isDeadEnd,
    };
  });
  const sectionsOverviewItems = scene.sections.map((section, index) => ({
    id: section.id,
    name: section.name || `Section ${index + 1}`,
    isSelected: section.id === state.selectedSectionId,
    rowBgc: section.id === state.selectedSectionId ? "ac" : "bg",
    rowBc: section.id === state.selectedSectionId ? "ac" : "mu",
    rowTextColor: section.id === state.selectedSectionId ? "bg" : "fg",
    isDeadEnd: !!sectionPresentationById[section.id]?.isDeadEnd,
  }));

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
            type: "input-text",
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
              label: "Rename",
            },
          ],
        },
      }
    : null;

  const selectedLine = currentSection?.lines?.find(
    (line) => line.id === state.selectedLineId,
  );

  return {
    scene: scene,
    sections,
    sectionsOverviewOpen: state.sectionsOverviewPanel.isOpen,
    sectionsOverviewItems,
    currentLines: Array.isArray(currentSection?.lines)
      ? currentSection.lines
      : [],
    dropdownMenu: state.dropdownMenu,
    popover: state.popover,
    form: renameForm,
    selectedLineId: state.selectedLineId,
    selectedLine,
    selectedLineActions: selectedLine?.actions || {},
    repositoryState,
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
    sectionsGraph: JSON.stringify(sectionTransitionsDAG, null, 2),
    previewVisible: state.previewVisible,
    previewSceneId: state.previewSceneId,
    previewSectionId: state.previewSectionId,
    previewLineId: state.previewLineId,
    presentationState: state.presentationState,
    sectionLineChanges: state.sectionLineChanges,
    isMuted: state.isMuted,
    muteIcon: state.isMuted ? "mute" : "unmute",
    isSceneAssetLoading: state.isSceneAssetLoading,
    deadEndTooltip: state.deadEndTooltip,
  };
};

export const selectLineIdIndex = ({ state }, props, payload) => {
  const { lineId } = payload;
  return state.currentLines.findIndex((line) => line.id === lineId);
};

export const selectPreviousLineId = ({ state }, payload) => {
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

export const selectNextLineId = ({ state }, payload) => {
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

export const toggleSectionsGraphView = ({ state }, _payload = {}) => {
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
        const sectionTransition = line.actions?.sectionTransition;

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

export const toggleMute = ({ state }, _payload = {}) => {
  state.isMuted = !state.isMuted;
};

export const selectIsMuted = ({ state }) => {
  return state.isMuted;
};

export const showDeadEndTooltip = ({ state }, { x, y, content } = {}) => {
  state.deadEndTooltip = {
    open: true,
    x,
    y,
    content,
  };
};

export const hideDeadEndTooltip = ({ state }, _payload = {}) => {
  state.deadEndTooltip = {
    ...state.deadEndTooltip,
    open: false,
  };
};
