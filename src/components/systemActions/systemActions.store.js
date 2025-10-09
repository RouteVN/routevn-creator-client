import { toFlatItems } from "../../deps/repository";

export const createInitialState = () => ({
  mode: "actions",
  isActionsDialogOpen: false,
  dropdownMenu: {
    isOpen: false,
    position: { x: 0, y: 0 },
    actionType: null,
    items: [
      {
        label: "Delete",
        type: "item",
        value: "delete",
      },
    ],
  },
});

export const selectViewData = ({ state, props }) => {
  const displayActions = selectDisplayActions({ state });
  const actionsObject = selectActionsData({ props });
  const actionsArray = convertActionsObjectToArray(actionsObject);

  const repositoryState = props.repositoryState || {};
  const layouts = Object.entries(repositoryState.layouts?.items || {})
    .filter(([_, layout]) => layout.layoutType === "dialogue")
    .map(([id, layout]) => ({
      id,
      name: layout.name,
      layoutType: layout.layoutType,
    }));

  const allCharacters = Object.entries(repositoryState.characters?.items || {});

  const filteredCharacters = allCharacters
    .filter(([_, character]) => {
      return character.type === "character";
    })
    .map(([id, character]) => ({
      id,
      name: character.name,
      type: character.type,
    }));

  return {
    currentSceneId: props.currentSceneId,
    mode: state.mode,
    isActionsDialogOpen: state.isActionsDialogOpen,
    dropdownMenu: state.dropdownMenu,
    displayActions,
    actions: actionsArray,
    actionsObject,
    repositoryState,
    selectedLineId: props.selectedLineId,
    layouts,
    allCharacters: filteredCharacters,
    selectedLine: props.selectedLine,
  };
};

export const selectDisplayActions = ({ state }) => {
  const { actions } = state;
  return Object.entries(actions).map(([key, value]) => {
    return {
      name: key,
      payload: value,
    };
  });
};

export const selectAction = ({ state }) => {
  return state.actions;
};

export const updateActions = (state, payload) => {
  state.actions = {
    ...state.actions,
    ...payload,
  };
};

export const showActionsDialog = (state) => {
  state.isActionsDialogOpen = true;
};

export const hideActionsDialog = (state) => {
  state.isActionsDialogOpen = false;
};

export const setMode = (state, payload) => {
  state.mode = payload.mode;
};

// Helper function to convert actions object to array for view compatibility
export const convertActionsObjectToArray = (actionsObject) => {
  return Object.values(actionsObject).filter(Boolean);
};

// Moved from sceneEditor.store.js - now returns object instead of array
export const selectActionsData = ({ props }) => {
  const { actions, repositoryState } = props;

  if (!actions) {
    return {};
  }

  const repositoryStateData = repositoryState || {};
  // Images and audios: accessed directly by ID (e.g., images[id])
  const images = repositoryStateData.images?.items || {};
  const audios = repositoryStateData.audio?.items || {};
  // Layouts: need full tree structure for toFlatItems() to search through nested folders
  const layoutsTree = repositoryStateData.layouts || {};

  const actionsObject = {};

  // Background
  if (actions.background) {
    const backgroundImage = images[actions.background.resourceId];
    if (backgroundImage) {
      actionsObject.background = {
        type: "background",
        id: "actions-action-background",
        dataMode: "background",
        icon: "image",
        data: {
          backgroundImage,
        },
      };
    }
  }

  // Layout
  if (actions.layout) {
    const layoutData = layoutsTree
      ? toFlatItems(layoutsTree).find((l) => l.id === actions.layout.resourceId)
      : null;
    if (layoutData) {
      actionsObject.layout = {
        type: "layout",
        id: "actions-action-layout",
        dataMode: "layout",
        icon: "layout",
        data: {
          layoutData,
        },
      };
    }
  }

  // BGM
  if (actions.bgm) {
    const bgmAudio = audios[actions.bgm.audioId];
    if (bgmAudio) {
      actionsObject.bgm = {
        type: "bgm",
        id: "actions-action-bgm",
        dataMode: "bgm",
        icon: "music",
        data: {
          bgmAudio: {
            fileId: bgmAudio.fileId,
            name: bgmAudio.name,
          },
        },
      };
    }
  }

  // Sound Effects
  if (actions.sfx?.items) {
    const soundEffectsAudio = actions.sfx.items.map((sfx) => ({
      ...sfx,
      audio: audios[sfx.audioId],
    }));
    const soundEffectsNames = soundEffectsAudio
      .map((sfx) => sfx.audio?.name || "Unknown")
      .filter((name) => name !== "Unknown")
      .join(", ");

    actionsObject.sfx = {
      type: "sfx",
      id: "actions-action-sfx",
      dataMode: "sfx",
      icon: "audio",
      data: {
        soundEffectsAudio,
        soundEffectsNames,
      },
    };
  }

  // Characters
  if (actions.character?.items) {
    const charactersData = actions.character.items.map((char) => {
      const character = repositoryStateData.characters?.items?.[char.id];
      let sprite = {};

      if (char.sprites?.[0]?.imageId && character?.sprites) {
        const spriteId = char.sprites[0].imageId;
        sprite.fileId = character.sprites?.items[spriteId]?.fileId;
      }

      return {
        ...char,
        character,
        sprite,
      };
    });

    const charactersNames = charactersData
      .map((char) => char.character?.name || "")
      .join(", ");

    actionsObject.characters = {
      type: "characters",
      id: "actions-action-characters",
      dataMode: "character",
      icon: "character",
      data: {
        charactersData,
        charactersNames,
      },
    };
  }

  // Transition (Scene or Section)
  const sectionTransitionData =
    actions.sectionTransition || actions.actions?.sectionTransition;
  if (sectionTransitionData) {
    const transition = sectionTransitionData;

    if (transition.sceneId) {
      // Scene Transition
      const scenes = repositoryStateData.scenes;
      const targetScene = scenes
        ? toFlatItems(scenes).find((scene) => scene.id === transition.sceneId)
        : null;

      const sections = toFlatItems(targetScene.sections);
      const section = sections.find(
        (section) => section.id === transition.sectionId,
      );

      const transitionData = {
        ...transition,
        scene: targetScene,
        section,
      };

      actionsObject.sectionTransition = {
        type: "sectionTransition",
        id: "actions-action-scene",
        dataMode: "sectionTransition",
        icon: "scene",
        data: {
          sectionTransitionData: transitionData,
        },
      };
    }
  }

  // Dialogue
  if (actions.dialogue) {
    const dialogueData =
      actions.dialogue.layoutId && layoutsTree
        ? toFlatItems(layoutsTree).find(
            (l) => l.id === actions.dialogue.layoutId,
          )
        : null;
    const dialogueCharacterData = actions.dialogue.characterId
      ? repositoryStateData.characters?.items?.[actions.dialogue.characterId]
      : null;

    actionsObject.dialogue = {
      type: "dialogue",
      id: "actions-action-dialogue",
      dataMode: "dialogue",
      icon: "dialogue",
      data: {
        dialogueData,
        dialogueCharacterData,
      },
    };
  }

  // Choices
  const choicesData = actions.choice || actions.actions?.choice;
  if (choicesData) {
    const layoutData =
      choicesData.resourceId && layoutsTree
        ? toFlatItems(layoutsTree).find((l) => l.id === choicesData.resourceId)
        : null;

    actionsObject.choices = {
      type: "choices",
      id: "actions-action-choices",
      dataMode: "choice",
      icon: "choices",
      data: {
        choicesData,
        layoutData,
      },
    };
  }

  // Screen
  if (actions.screen) {
    const screenData =
      actions.screen.resourceId && layoutsTree
        ? toFlatItems(layoutsTree).find(
            (l) => l.id === actions.screen.resourceId,
          )
        : null;

    if (screenData) {
      actionsObject.screen = {
        type: "screen",
        id: "actions-action-screen",
        dataMode: "screen",
        icon: "screen",
        data: {
          screenData,
        },
      };
    }
  }

  // Next Line
  if (actions.nextLine) {
    actionsObject.nextLine = {
      type: "nextLine",
      id: "actions-action-next-line",
      dataMode: "nextLine",
      icon: "next-line",
      data: {},
    };
  }

  return actionsObject;
};

export const showDropdownMenu = (state, { position, actionType }) => {
  state.dropdownMenu = {
    ...state.dropdownMenu,
    isOpen: true,
    position,
    actionType,
  };
};

export const hideDropdownMenu = (state) => {
  state.dropdownMenu.isOpen = false;
  state.dropdownMenu.actionType = null;
};

export const selectDropdownMenuActionType = ({ state }) => {
  return state.dropdownMenu.actionType;
};

export const deleteAction = (state, _actionType) => {
  // This will be handled in the component that owns the actions data
  // For now, just hide the dropdown menu
  hideDropdownMenu(state);
};
