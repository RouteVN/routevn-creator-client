import { toFlatItems } from "insieme";

// Get character sprite fileId from presentation state character
function getCharacterSpriteFileId(char, repositoryState) {
  const character = repositoryState?.characters?.items?.[char.id];
  if (char.sprites?.[0]?.imageId && character?.sprites) {
    const spriteId = char.sprites[0].imageId;
    return character.sprites?.items?.[spriteId]?.fileId;
  }
  return null;
}

// Compute changes between two presentation states
function computeChanges(prevState, currentState, repositoryState) {
  const changes = {
    characters: { added: [], updated: [], deleted: [] },
    background: null,
    dialogue: null,
    base: null,
    bgm: null,
  };

  // Character changes
  const prevChars = new Map();
  if (prevState.characters?.items) {
    prevState.characters.items.forEach((char) => prevChars.set(char.id, char));
  }
  const currentChars = new Map();
  if (currentState.characters?.items) {
    currentState.characters.items.forEach((char) =>
      currentChars.set(char.id, char),
    );
  }

  // Added characters
  for (const [id, char] of currentChars) {
    if (!prevChars.has(id)) {
      const fileId = getCharacterSpriteFileId(char, repositoryState);
      if (fileId) changes.characters.added.push({ id, fileId });
    }
  }

  // Updated characters (sprite changed)
  for (const [id, char] of currentChars) {
    if (prevChars.has(id)) {
      const prevChar = prevChars.get(id);
      if (prevChar.sprites?.[0]?.imageId !== char.sprites?.[0]?.imageId) {
        const fileId = getCharacterSpriteFileId(char, repositoryState);
        if (fileId) changes.characters.updated.push({ id, fileId });
      }
    }
  }

  // Deleted characters
  for (const [id, char] of prevChars) {
    if (!currentChars.has(id)) {
      const fileId = getCharacterSpriteFileId(char, repositoryState);
      if (fileId) changes.characters.deleted.push({ id, fileId });
    }
  }

  // Background changes
  const prevBg = prevState.background;
  const currBg = currentState.background;
  if (prevBg && !currBg) {
    const fileId =
      repositoryState?.images?.items?.[prevBg.resourceId]?.fileId || null;
    changes.background = { type: "deleted", fileId };
  } else if (!prevBg && currBg) {
    const fileId =
      repositoryState?.images?.items?.[currBg.resourceId]?.fileId || null;
    changes.background = { type: "added", fileId };
  } else if (prevBg && currBg && prevBg.resourceId !== currBg.resourceId) {
    const fileId =
      repositoryState?.images?.items?.[currBg.resourceId]?.fileId || null;
    changes.background = { type: "updated", fileId };
  }

  // Dialogue changes
  const prevDialogue = prevState.dialogue;
  const currDialogue = currentState.dialogue;
  if (prevDialogue && !currDialogue) {
    changes.dialogue = { type: "deleted" };
  } else if (!prevDialogue && currDialogue) {
    changes.dialogue = { type: "added" };
  } else if (
    prevDialogue &&
    currDialogue &&
    prevDialogue.gui?.resourceId !== currDialogue.gui?.resourceId
  ) {
    changes.dialogue = { type: "updated" };
  }

  // Base changes
  const prevBase = prevState.base;
  const currBase = currentState.base;
  if (prevBase && !currBase) {
    changes.base = { type: "deleted" };
  } else if (!prevBase && currBase) {
    changes.base = { type: "added" };
  } else if (
    prevBase &&
    currBase &&
    prevBase.resourceId !== currBase.resourceId
  ) {
    changes.base = { type: "updated" };
  }

  // BGM changes
  const prevBgm = prevState.bgm;
  const currBgm = currentState.bgm;
  if (prevBgm && !currBgm) {
    changes.bgm = { type: "deleted" };
  } else if (!prevBgm && currBgm) {
    changes.bgm = { type: "added" };
  } else if (prevBgm && currBgm && prevBgm.resourceId !== currBgm.resourceId) {
    changes.bgm = { type: "updated" };
  }

  return changes;
}

// Apply line actions to presentation state
function applyActionsToState(presentationState, actions) {
  const newState = { ...presentationState };

  // Characters - replace entire list
  if (actions.character) {
    if (actions.character.items && actions.character.items.length > 0) {
      newState.characters = {
        items: actions.character.items.map((char) => ({
          id: char.id,
          sprites: char.sprites || [],
        })),
      };
    } else {
      delete newState.characters;
    }
  }

  // Background
  if (actions.background) {
    newState.background = actions.background;
  }

  // Dialogue
  if (actions.dialogue) {
    if (actions.dialogue.clear) {
      delete newState.dialogue;
    } else if (actions.dialogue.gui) {
      newState.dialogue = actions.dialogue;
    }
  }

  // Base
  if (actions.base?.resourceId) {
    newState.base = actions.base;
  }

  // BGM
  if (actions.bgm) {
    newState.bgm = actions.bgm;
  }

  return newState;
}

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
  // Track running presentation state
  let runningPresentationState = {};

  const lines = (props.lines || []).map((line, i) => {
    const isSelected = props.selectedLineId === line.id;
    const isBlockMode = state.mode === "block";

    // State before this line
    const prevState = { ...runningPresentationState };

    // Apply this line's actions
    runningPresentationState = applyActionsToState(
      runningPresentationState,
      line.actions || {},
    );

    // Compute changes
    const changes = computeChanges(
      prevState,
      runningPresentationState,
      state.repositoryState,
    );

    // Dialogue character icon
    let characterFileId;
    if (line.actions?.dialogue?.characterId) {
      const characters = toFlatItems(state.repositoryState.characters || []);
      const character = characters.find(
        (c) => c.id === line.actions.dialogue.characterId,
      );
      if (character && character.fileId) {
        characterFileId = character.fileId;
      }
    }

    let sectionTransition;
    let transitionTarget;
    let hasChoices;
    let choices;
    let hasSfx = false;

    // Section transitions
    const sectionTransitionData =
      line.actions?.sectionTransition ||
      line.actions?.actions?.sectionTransition;
    if (sectionTransitionData) {
      if (sectionTransitionData.sceneId) {
        sectionTransition = true;
        const allScenes = toFlatItems(state.repositoryState.scenes || []);
        const targetScene = allScenes.find(
          (scene) => scene.id === sectionTransitionData.sceneId,
        );
        transitionTarget = targetScene?.name || "Unknown Scene";
      } else if (sectionTransitionData.sectionId) {
        sectionTransition = true;
        const allScenes = toFlatItems(state.repositoryState.scenes || []);
        let sectionName = "Unknown Section";
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

    // Choices
    const choicesData = line.actions?.choice || line.actions?.actions?.choice;
    if (choicesData && choicesData.items && choicesData.items.length > 0) {
      hasChoices = true;
      choices = choicesData.items;
    }

    // SFX
    if (line.actions?.sfx?.items && line.actions.sfx.items.length > 0) {
      hasSfx = true;
    }

    return {
      ...line,
      lineNumber: i + 1,
      lineColor: isSelected ? "fg" : "mu-fg",
      backgroundColor:
        isSelected && isBlockMode ? "var(--muted)" : "transparent",
      characterFileId,
      changes,
      sectionTransition,
      transitionTarget,
      hasChoices,
      choices,
      hasSfx,
    };
  });

  console.log("Lines: ", lines);

  return {
    lines,
    selectedLineId: props.selectedLineId,
    mode: state.mode,
    ready: state.ready,
  };
};
