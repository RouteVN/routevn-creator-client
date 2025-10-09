import { toFlatItems } from "../../deps/repository";

export const createInitialState = () => ({
  ready: false,
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

export const setReady = (state) => {
  state.ready = true;
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

export const selectViewData = ({ state, props }) => {
  const lines = (props.lines || []).map((line, i) => {
    const isSelected = props.selectedLineId === line.id;
    const isBlockMode = state.mode === "block";

    let backgroundFileId;
    if (line.actions?.background) {
      const resourceId = line.actions.background.resourceId;
      backgroundFileId = state.repositoryState.images.items[resourceId]?.fileId;
    }

    // Character sprites for display (characters shown on screen)
    let characterSprites = [];
    if (
      line.actions?.character?.items &&
      line.actions.character.items.length > 0
    ) {
      // Collect all character sprites
      characterSprites = line.actions.character.items
        .map((char) => {
          const character = state.repositoryState.characters?.items?.[char.id];
          let spriteFileId = null;

          if (char.sprites && char.sprites.length > 0 && character?.sprites) {
            const firstSprite = char.sprites[0];
            if (firstSprite.imageId) {
              // First try to get from character sprites
              const flatSprites = toFlatItems(character.sprites);
              const sprite = flatSprites.find(
                (s) => s.id === firstSprite.imageId,
              );
              if (sprite?.fileId) {
                spriteFileId = sprite.fileId;
              } else if (
                state.repositoryState.images?.items?.[firstSprite.imageId]
              ) {
                // Fallback to images repository
                spriteFileId =
                  state.repositoryState.images.items[firstSprite.imageId]
                    .fileId;
              }
            }
          }

          return {
            characterId: char.id,
            characterName: character?.name || "Unknown",
            fileId: spriteFileId,
          };
        })
        .filter((char) => char.fileId); // Only keep characters with valid sprites
    }

    // Dialogue character icon (who is speaking)
    let characterFileId;
    if (line.actions?.dialogue?.characterId) {
      // Get character data from repository
      const characters = toFlatItems(state.repositoryState.characters || []);
      const character = characters.find(
        (c) => c.id === line.actions.dialogue.characterId,
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
    let hasBgm = false;
    let hasSfx = false;
    let hasDialogueLayout = false;
    let hasScreen = false;

    // Check for BGM
    if (line.actions?.bgm?.audioId) {
      hasBgm = true;
    }

    // Check for SFX
    if (line.actions?.sfx?.items && line.actions.sfx.items.length > 0) {
      hasSfx = true;
    }

    // Check for Dialogue Layout
    if (line.actions?.dialogue?.layoutId) {
      hasDialogueLayout = true;
    }

    // Check for Screen
    if (line.actions?.screen?.resourceId) {
      hasScreen = true;
    }

    // Handle both nested and non-nested structures
    const sectionTransitionData =
      line.actions?.sectionTransition ||
      line.actions?.actions?.sectionTransition;

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
              (section) => section.id === sectionTransitionData.sectionId,
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
    const choicesData = line.actions?.choice || line.actions?.actions?.choice;
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
      characterSprites,
      sceneTransition,
      sectionTransition,
      transitionTarget,
      hasChoices,
      choices,
      hasBgm,
      hasSfx,
      hasDialogueLayout,
      hasScreen,
    };
  });

  return {
    lines,
    selectedLineId: props.selectedLineId,
    mode: state.mode,
    ready: state.ready,
  };
};
