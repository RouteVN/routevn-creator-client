import { toFlatItems } from "../../deps/repository";

export const INITIAL_STATE = Object.freeze({
  mode: "block", // 'block' or 'text-editor'
  cursorPosition: 0, // Track cursor position for navigation
  goalColumn: 0, // Remember the desired column when moving vertically
  isNavigating: false, // Flag to prevent cursor reset during navigation
  navigationDirection: null, // 'up', 'down', 'end', or null - for proper cursor positioning
  repositoryState: {},
});

export const setMode = (state, mode) => {
  state.mode = mode;
};

export const setRepositoryState = (state, repositoryState) => {
  state.repositoryState = repositoryState;
};

export const setCursorPosition = (state, position) => {
  state.cursorPosition = position;
};

export const setIsNavigating = (state, isNavigating) => {
  state.isNavigating = isNavigating;
};

export const setGoalColumn = (state, goalColumn) => {
  state.goalColumn = goalColumn;
};

export const setNavigationDirection = (state, direction) => {
  state.navigationDirection = direction;
};

export const selectMode = ({ state }) => {
  return state.mode;
};

export const selectCursorPosition = ({ state }) => {
  return state.cursorPosition;
};

export const selectIsNavigating = ({ state }) => {
  return state.isNavigating;
};

export const selectGoalColumn = ({ state }) => {
  return state.goalColumn;
};

export const selectNavigationDirection = ({ state }) => {
  return state.navigationDirection;
};

export const toViewData = ({ state, props }) => {
  const lines = (props.lines || []).map((line, i) => {
    const isSelected = props.selectedLineId === line.id;
    const isBlockMode = state.mode === "block";

    let backgroundFileId;
    if (line.presentation?.background) {
      const resourceId = line.presentation.background.resourceId;
      backgroundFileId = state.repositoryState.images.items[resourceId]?.fileId;
    }

    let characterFileId;
    // Check if line has character presentation with sprites
    if (
      line.presentation?.character?.items &&
      line.presentation.character.items.length > 0
    ) {
      const firstCharacter = line.presentation.character.items[0];
      // Check if character has sprites array
      if (firstCharacter.sprites && firstCharacter.sprites.length > 0) {
        const firstSprite = firstCharacter.sprites[0];
        // Get the image file ID from the images repository
        if (
          firstSprite.imageId &&
          state.repositoryState.images?.items?.[firstSprite.imageId]
        ) {
          characterFileId =
            state.repositoryState.images.items[firstSprite.imageId].fileId;
        }
      }
    }

    // Also check for dialogue character data
    if (!characterFileId && line.presentation?.dialogue?.characterId) {
      // Get character data from repository
      const characters = toFlatItems(state.repositoryState.characters || []);
      const character = characters.find(
        (c) => c.id === line.presentation.dialogue.characterId,
      );

      if (character && character.fileId) {
        characterFileId = character.fileId;
      }
    }

    let sceneTransition;
    let sectionTransition;
    let transitionTarget;
    let hasChoices;
    let choices;

    // Handle both nested and non-nested structures
    const sectionTransitionData =
      line.presentation?.sectionTransition ||
      line.presentation?.presentation?.sectionTransition;

    if (sectionTransitionData) {
      if (sectionTransitionData.sceneId) {
        sceneTransition = true;
        // Get scene name from repository
        const allScenes = toFlatItems(state.repositoryState.scenes || []);
        const targetScene = allScenes.find(
          (scene) => scene.id === sectionTransitionData.sceneId,
        );
        transitionTarget = targetScene?.name || "Unknown Scene";
      } else if (sectionTransitionData.sectionId) {
        sectionTransition = true;
        // Get section name from the scene that contains this section
        const allScenes = toFlatItems(state.repositoryState.scenes || []);
        let sectionName = "Unknown Section";
        
        // Find the section across all scenes
        for (const scene of allScenes) {
          if (scene.sections) {
            const sections = toFlatItems(scene.sections);
            const targetSection = sections.find(
              (section) => section.id === sectionTransitionData.sectionId
            );
            if (targetSection) {
              sectionName = targetSection.name || sectionName;
              break;
            }
          }
        }
        
        transitionTarget = sectionName;
      }
    }

    // Handle choices
    const choicesData =
      line.presentation?.choice || line.presentation?.presentation?.choice;
    if (choicesData && choicesData.items && choicesData.items.length > 0) {
      hasChoices = true;
      choices = choicesData.items;
    }

    return {
      ...line,
      lineNumber: i + 1,
      lineColor: isSelected ? "fg" : "mu-fg",
      backgroundColor:
        isSelected && isBlockMode ? "var(--muted)" : "transparent",
      backgroundFileId,
      characterFileId,
      sceneTransition,
      sectionTransition,
      transitionTarget,
      hasChoices,
      choices,
    };
  });

  return {
    lines,
    selectedLineId: props.selectedLineId,
    mode: state.mode,
  };
};
