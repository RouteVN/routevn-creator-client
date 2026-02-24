import { toFlatItems } from "#tree-state";

export const createInitialState = () => ({
  ready: false,
  mode: "block", // 'block' or 'text-editor'
  cursorPosition: 0, // Track cursor position for navigation
  goalColumn: 0, // Remember the desired column when moving vertically
  isNavigating: false, // Flag to prevent cursor reset during navigation
  navigationDirection: null, // 'up', 'down', 'end', or null - for proper cursor positioning
  repositoryState: {},
});

export const setMode = ({ state }, { mode } = {}) => {
  state.mode = mode;
};

export const setReady = ({ state }, _payload = {}) => {
  state.ready = true;
};

export const setRepositoryState = ({ state }, { repositoryState } = {}) => {
  state.repositoryState = repositoryState;
};

export const setCursorPosition = ({ state }, { position } = {}) => {
  state.cursorPosition = position;
};

export const setIsNavigating = ({ state }, { isNavigating } = {}) => {
  state.isNavigating = isNavigating;
};

export const setGoalColumn = ({ state }, { goalColumn } = {}) => {
  state.goalColumn = goalColumn;
};

export const setNavigationDirection = ({ state }, { direction } = {}) => {
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

export const selectLineContent = ({ props }, payload) => {
  const { lineId } = payload;
  const line = (props.lines || []).find((l) => l.id === lineId);
  if (line) {
    const firstContent = line.actions?.dialogue?.content?.[0];
    if (firstContent) {
      return firstContent.text || "";
    }
  }
};

export const selectViewData = ({ state, props }) => {
  const sectionLineChanges = props.sectionLineChanges || {};
  const changesLines = sectionLineChanges.lines || [];

  const lines = (props.lines || []).map((line, i) => {
    const isSelected = props.selectedLineId === line.id;
    const isBlockMode = state.mode === "block";

    // Find changes for this line
    const lineChanges = changesLines.find((change) => change.id === line.id);
    const changes = lineChanges?.changes || {};

    // Process background changes
    let background;
    if (changes.background) {
      const bgData = changes.background.data || {};
      background = {
        changeType: changes.background.changeType,
        resourceId: bgData.resourceId,
        fileId:
          state.repositoryState.images?.items?.[bgData.resourceId]?.fileId,
      };
    }

    // Process character changes
    let characterSprites;
    if (changes.character) {
      const charData = changes.character.data || {};
      if (charData.items && charData.items.length > 0) {
        characterSprites = {
          changeType: changes.character.changeType,
          items: charData.items
            .map((char) => {
              const character =
                state.repositoryState.characters?.items?.[char.id];
              let spriteFileId = null;

              if (
                char.sprites &&
                char.sprites.length > 0 &&
                character?.sprites
              ) {
                const firstSprite = char.sprites[0];
                if (firstSprite.resourceId) {
                  const flatSprites = toFlatItems(character.sprites);
                  const sprite = flatSprites.find(
                    (s) => s.id === firstSprite.resourceId,
                  );
                  if (sprite?.fileId) {
                    spriteFileId = sprite.fileId;
                  } else if (
                    state.repositoryState.images?.items?.[
                      firstSprite.resourceId
                    ]
                  ) {
                    spriteFileId =
                      state.repositoryState.images.items[firstSprite.resourceId]
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
            .filter((char) => char.fileId),
        };
      } else {
        characterSprites = {
          changeType: changes.character.changeType,
          items: [],
        };
      }
    }

    // Process BGM changes
    let bgm;
    if (changes.bgm) {
      const bgmData = changes.bgm.data || {};
      bgm = {
        changeType: changes.bgm.changeType,
        resourceId: bgmData.resourceId,
      };
    }

    // Process SFX changes
    let hasSfx = false;
    let sfxChangeType;
    if (changes.sfx) {
      hasSfx = true;
      sfxChangeType = changes.sfx.changeType;
    }

    // Process Set Next Line Config changes
    let hasSetNextLineConfig = false;
    let setNextLineConfigChangeType;
    if (changes.setNextLineConfig) {
      hasSetNextLineConfig = true;
      setNextLineConfigChangeType = changes.setNextLineConfig.changeType;
    }

    // Process dialogue layout changes
    let hasDialogueLayout = false;
    let dialogueChangeType;
    if (changes.dialogue) {
      hasDialogueLayout = true;
      dialogueChangeType = changes.dialogue.changeType;
    }

    // Process base changes
    let hasBase = false;
    let baseChangeType;
    if (changes.base) {
      hasBase = true;
      baseChangeType = changes.base.changeType;
    }

    // Dialogue character icon (who is speaking) - still from line.actions
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

    // Section transitions and choices - still from line.actions
    let sectionTransition;
    let transitionTarget;
    let hasChoices;
    let choices;

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

    const choicesData = line.actions?.choice || line.actions?.actions?.choice;
    if (choicesData && choicesData.items && choicesData.items.length > 0) {
      hasChoices = true;
      choices = choicesData.items;
    }

    if (
      line.actions?.setNextLineConfig ||
      line.actions?.actions?.setNextLineConfig
    ) {
      hasSetNextLineConfig = true;
    }

    return {
      ...line,
      lineNumber: i + 1,
      lineColor: isSelected ? "fg" : "mu-fg",
      background,
      bgm,
      backgroundColor:
        isSelected && isBlockMode ? "var(--muted)" : "transparent",
      characterFileId,
      characterSprites,
      sectionTransition,
      transitionTarget,
      hasChoices,
      choices,
      hasSfx,
      sfxChangeType,
      hasSetNextLineConfig,
      setNextLineConfigChangeType,
      hasDialogueLayout,
      dialogueChangeType,
      hasBase,
      baseChangeType,
    };
  });

  return {
    lines,
    selectedLineId: props.selectedLineId,
    mode: state.mode,
    ready: state.ready,
  };
};
