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
  repositoryState: {}, // Add this - default to empty object
  localPresentationState: null,
});

export const selectViewData = ({ state, props, attrs }) => {
  const displayActions = selectDisplayActions({ state });
  const { actions: actionsObject, preview } = selectActionsData({
    props,
    state,
  });

  const repositoryState = state.repositoryState;
  const choiceLayouts = Object.entries(repositoryState.layouts?.items || {})
    .filter(([_, layout]) => layout.layoutType === "choice")
    .map(([id, layout]) => ({
      id,
      name: layout.name,
      layoutType: layout.layoutType,
    }));

  const baseLayouts = Object.entries(repositoryState.layouts?.items || {})
    .filter(([_, layout]) => layout.layoutType === "base")
    .map(([id, layout]) => ({
      id,
      name: layout.name,
      layoutType: layout.layoutType,
    }));

  const dialogueLayouts = Object.entries(repositoryState.layouts?.items || {})
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
    actions: actionsObject,
    preview,
    repositoryState,
    selectedLineId: props.selectedLineId,
    layouts: choiceLayouts, // Default to choice layouts for backward compatibility
    choiceLayouts,
    baseLayouts,
    dialogueLayouts,
    allCharacters: filteredCharacters,
    selectedLine: props.selectedLine,
    actionsType: attrs["action-type"],
    showSelected: !!attrs["show-selected"],
  };
};

export const setLocalPresentationState = (state, presentationState) => {
  state.localPresentationState = presentationState;
};


export const selectRepositoryState = ({ state }) => {
  return state.repositoryState;
};

export const setRepositoryState = (state, repositoryState) => {
  state.repositoryState = repositoryState;
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
  state.mode = "hidden";
};

export const setMode = (state, payload) => {
  state.mode = payload.mode;
};

// Moved from sceneEditor.store.js - now returns object instead of array
export const selectActionsData = ({ props, state }) => {
  const { actions } = props;
  const presentationState = state.localPresentationState ?? props.presentationState ?? {};

  if (!actions) {
    return {};
  }

  const repositoryStateData = state.repositoryState;
  // Images and sounds: accessed directly by ID (e.g., images[id])
  const images = repositoryStateData.images?.items || {};
  const sounds = repositoryStateData.sounds?.items || {};
  const scenes = repositoryStateData.scenes || {};
  // Layouts: need full tree structure for toFlatItems() to search through nested folders
  const layoutsTree = repositoryStateData.layouts || {};

  const actionsObject = {};
  const preview = {};

  if (presentationState.background) {
    const backgroundImage = images[presentationState.background.resourceId];
    const backgroundLayout =
      layoutsTree.items?.[presentationState.background.resourceId];
    actionsObject.background = presentationState.background;
    if (backgroundImage) {
      preview.background = { ...backgroundImage, type: "image" };
    } else if (backgroundLayout) {
      preview.background = { ...backgroundLayout, type: "layout" };
    }
  }

  if (presentationState.layout) {
    actionsObject.layout = presentationState.layout;
    preview.layout = layoutsTree.items[presentationState.layout.resourceId];
  }

  if (presentationState.bgm) {
    actionsObject.bgm = presentationState.bgm;
    preview.bgm = sounds[presentationState.bgm.resourceId];
  }

  // Sound Effects
  if (actions.sfx?.items) {
    const soundEffectsData = actions.sfx.items.map((sfx) => ({
      ...sfx,
      sound: sounds[sfx.resourceId],
    }));
    const names = soundEffectsData
      .map((sfx) => sfx.sound?.name || "")
      .filter((name) => name !== "")
      .join(", ");

    actionsObject.sfx = actions.sfx;
    preview.sfx = {
      names,
    };
  }

  if (presentationState.character?.items) {
    actionsObject.character = presentationState.character;
    preview.character = presentationState.character.items.map((char) => {
      const character = repositoryStateData.characters?.items?.[char.id];
      let sprite = {};

      if (char.sprites?.[0]?.imageId && character?.sprites) {
        const spriteId = char.sprites[0].imageId;
        sprite.fileId = character.sprites?.items[spriteId]?.fileId;
      }

      return {
        ...char,
        name: character?.name || "",
        sprite,
      };
    });
  }

  if (actions.sectionTransition) {
    actionsObject.sectionTransition = actions.sectionTransition;
    const scene = scenes.items[actions.sectionTransition.sceneId];
    if (scene) {
      preview.sectionTransition = {
        scene,
        section: scene.sections.items[actions.sectionTransition.sectionId],
      };
    }
  }

  if (presentationState.dialogue) {
    actionsObject.dialogue = presentationState.dialogue;
    preview.dialogue =
      layoutsTree.items[presentationState.dialogue.gui?.resourceId];
  }

  if (actions.choice) {
    actionsObject.choice = actions.choice;
    preview.choice = {
      layout: layoutsTree.items[actions.choice.layoutId],
      items: actions.choice.items,
    };
  }

  if (presentationState.base) {
    actionsObject.base = presentationState.base;
    preview.base = layoutsTree.items[presentationState.base.resourceId];
  }

  // Next Line
  if (actions.nextLine) {
    actionsObject.nextLine = actions.nextLine;
    preview.nextLine = actions.nextLine;
  }

  return {
    actions: actionsObject,
    preview,
  };
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
  hideDropdownMenu(state);
};
