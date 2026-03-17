import { nanoid } from "nanoid";
import {
  getFirstTextStyleId,
  getTextStyleCount,
  getTextStyleRemovalCount,
} from "../../constants/textStyles.js";
import { recursivelyCheckResource } from "../project/projection.js";

const isTextElementType = (type) =>
  [
    "text",
    "text-ref-character-name",
    "text-revealing-ref-dialogue-content",
    "text-ref-choice-item-content",
    "text-ref-dialogue-line-character-name",
    "text-ref-dialogue-line-content",
  ].includes(type);

const resolveMenuItem = (detail = {}) => detail.item || detail;

const resolveExplorerMove = (detail = {}) => {
  const { position, source, target } = detail;
  if (!source?.id) {
    return null;
  }

  if (position === "inside") {
    if (target?.type !== "folder") {
      return null;
    }

    return {
      itemId: source.id,
      parentId: target.id,
      repositoryPosition: "last",
    };
  }

  if (position === "above") {
    if (!target?.id) {
      return null;
    }

    return {
      itemId: source.id,
      parentId: target.parentId ?? null,
      repositoryPosition: "before",
      repositoryPositionTargetId: target.id,
    };
  }

  if (position === "below") {
    if (!target?.id) {
      return null;
    }

    return {
      itemId: source.id,
      parentId: target.parentId ?? null,
      repositoryPosition: "after",
      repositoryPositionTargetId: target.id,
    };
  }

  return null;
};

const createActionHandlers = ({ handleAction, handleMove }) => {
  return {
    handleFileExplorerAction: async (deps, payload) => {
      await handleAction({
        deps,
        detail: payload?._event?.detail || {},
      });
    },
    handleFileExplorerTargetChanged: async (deps, payload) => {
      await handleMove({
        deps,
        detail: payload?._event?.detail || {},
      });
    },
  };
};

const noopRefresh = async () => {};

const RESOURCE_FILE_EXPLORER_API = Object.freeze({
  images: {
    createMethod: "createImage",
    updateMethod: "updateImage",
    moveMethod: "moveImage",
    deleteMethod: "deleteImages",
    idField: "imageId",
    deleteField: "imageIds",
  },
  sounds: {
    createMethod: "createSound",
    updateMethod: "updateSound",
    moveMethod: "moveSound",
    deleteMethod: "deleteSounds",
    idField: "soundId",
    deleteField: "soundIds",
  },
  videos: {
    createMethod: "createVideo",
    updateMethod: "updateVideo",
    moveMethod: "moveVideo",
    deleteMethod: "deleteVideos",
    idField: "videoId",
    deleteField: "videoIds",
  },
  animations: {
    createMethod: "createAnimation",
    updateMethod: "updateAnimation",
    moveMethod: "moveAnimation",
    deleteMethod: "deleteAnimations",
    idField: "animationId",
    deleteField: "animationIds",
  },
  characters: {
    createMethod: "createCharacter",
    updateMethod: "updateCharacter",
    moveMethod: "moveCharacter",
    deleteMethod: "deleteCharacters",
    idField: "characterId",
    deleteField: "characterIds",
  },
  fonts: {
    createMethod: "createFont",
    updateMethod: "updateFont",
    moveMethod: "moveFont",
    deleteMethod: "deleteFonts",
    idField: "fontId",
    deleteField: "fontIds",
  },
  transforms: {
    createMethod: "createTransform",
    updateMethod: "updateTransform",
    moveMethod: "moveTransform",
    deleteMethod: "deleteTransforms",
    idField: "transformId",
    deleteField: "transformIds",
  },
  colors: {
    createMethod: "createColor",
    updateMethod: "updateColor",
    moveMethod: "moveColor",
    deleteMethod: "deleteColors",
    idField: "colorId",
    deleteField: "colorIds",
  },
  textStyles: {
    createMethod: "createTextStyle",
    updateMethod: "updateTextStyle",
    moveMethod: "moveTextStyle",
    deleteMethod: "deleteTextStyles",
    idField: "textStyleId",
    deleteField: "textStyleIds",
  },
  variables: {
    createMethod: "createVariable",
    updateMethod: "updateVariable",
    moveMethod: "moveVariable",
    deleteMethod: "deleteVariables",
    idField: "variableId",
    deleteField: "variableIds",
  },
});

const validateResourceDeletion = async ({
  appService,
  projectService,
  resourceType,
  currentItem,
  itemId,
}) => {
  const state = projectService.getState();
  const currentItemType = currentItem?.type;

  if (currentItemType === "character") {
    if (currentItem?.sprites?.items) {
      for (const spriteId of Object.keys(currentItem.sprites.items)) {
        const usage = recursivelyCheckResource({
          state,
          itemId: spriteId,
          checkTargets: ["scenes", "layouts"],
        });

        if (usage.isUsed) {
          appService.showToast(
            "Cannot delete resource, it is currently in use.",
          );
          return false;
        }
      }
    }
  }

  if (currentItemType === "textStyle") {
    const textStyleCount = getTextStyleCount(state.textStyles);
    const removalCount = getTextStyleRemovalCount(state.textStyles, itemId);
    if (textStyleCount - removalCount < 1) {
      appService.showToast("At least one text style must remain.");
      return false;
    }
  }

  let checkTargets = ["scenes", "layouts"];
  if (currentItemType === "textStyle") {
    checkTargets = ["layouts"];
  } else if (currentItemType === "color" || currentItemType === "font") {
    checkTargets = ["textStyles"];
  } else if (resourceType === "characters") {
    checkTargets = ["scenes", "layouts"];
  }

  const usage = recursivelyCheckResource({
    state,
    itemId,
    checkTargets,
  });

  if (usage.isUsed) {
    appService.showToast("Cannot delete resource, it is currently in use.");
    return false;
  }

  return true;
};

export const createResourceFileExplorerHandlers = ({
  resourceType,
  refresh = noopRefresh,
}) => {
  const resourceApi = RESOURCE_FILE_EXPLORER_API[resourceType];

  return createActionHandlers({
    handleAction: async ({ deps, detail }) => {
      const { appService, projectService } = deps;
      await projectService.ensureRepository();

      const state = projectService.getState();
      const menuItem = resolveMenuItem(detail);
      const action = menuItem?.value;
      const itemId = detail.itemId;
      const collection = state?.[resourceType];
      const currentItem = collection?.items?.[itemId];

      if (action === "new-item") {
        await projectService[resourceApi.createMethod]({
          [resourceApi.idField]: nanoid(),
          data: {
            type: "folder",
            name: "New Folder",
          },
          parentId: null,
          position: "last",
        });
      } else if (action === "new-child-folder") {
        if (!itemId) {
          return;
        }

        await projectService[resourceApi.createMethod]({
          [resourceApi.idField]: nanoid(),
          data: {
            type: "folder",
            name: "New Folder",
          },
          parentId: itemId,
          position: "last",
        });
      } else if (action === "rename-item-confirmed") {
        if (!itemId || !detail.newName) {
          return;
        }

        await projectService[resourceApi.updateMethod]({
          [resourceApi.idField]: itemId,
          data: {
            name: detail.newName,
          },
        });
      } else if (action === "delete-item") {
        if (!currentItem) {
          return;
        }

        const canDelete = await validateResourceDeletion({
          appService,
          projectService,
          resourceType,
          currentItem,
          itemId,
        });
        if (!canDelete) {
          return;
        }

        await projectService[resourceApi.deleteMethod]({
          [resourceApi.deleteField]: [itemId],
        });
      } else if (
        action &&
        typeof action === "object" &&
        action.action === "new-child-item"
      ) {
        const nextValue = {
          ...action,
          id: nanoid(),
        };
        delete nextValue.action;

        await projectService[resourceApi.createMethod]({
          [resourceApi.idField]: nextValue.id,
          data: nextValue,
          parentId: itemId || null,
          position: "last",
        });
      } else {
        return;
      }

      await refresh(deps);
    },
    handleMove: async ({ deps, detail }) => {
      const { projectService } = deps;
      await projectService.ensureRepository();

      const move = resolveExplorerMove(detail);
      if (!move) {
        return;
      }

      await projectService[resourceApi.moveMethod]({
        [resourceApi.idField]: move.itemId,
        parentId: move.parentId,
        position: move.repositoryPosition,
        positionTargetId: move.repositoryPositionTargetId,
      });

      await refresh(deps);
    },
  });
};

export const createLayoutsFileExplorerHandlers = ({
  refresh = noopRefresh,
}) => {
  return createActionHandlers({
    handleAction: async ({ deps, detail }) => {
      const { appService, projectService } = deps;
      await projectService.ensureRepository();

      const state = projectService.getState();
      const menuItem = resolveMenuItem(detail);
      const action = menuItem?.value;
      const itemId = detail.itemId;
      const collection = state?.layouts;
      const currentItem = collection?.items?.[itemId];

      if (action === "new-item") {
        await projectService.createLayoutItem({
          layoutId: nanoid(),
          name: "New Folder",
          parentId: null,
          position: "last",
          data: {
            type: "folder",
          },
        });
      } else if (action === "new-child-folder") {
        if (!itemId) {
          return;
        }

        await projectService.createLayoutItem({
          layoutId: nanoid(),
          name: "New Folder",
          parentId: itemId,
          position: "last",
          data: {
            type: "folder",
          },
        });
      } else if (action === "rename-item-confirmed") {
        if (!itemId || !detail.newName) {
          return;
        }

        await projectService.renameLayoutItem({
          layoutId: itemId,
          name: detail.newName,
        });
      } else if (action === "delete-item") {
        if (!currentItem) {
          return;
        }

        const usage = recursivelyCheckResource({
          state,
          itemId,
          checkTargets: ["scenes"],
        });

        if (usage.isUsed) {
          appService.showToast(
            "Cannot delete resource, it is currently in use.",
          );
          return;
        }

        await projectService.deleteLayoutItem({
          layoutIds: [itemId],
        });
      } else {
        return;
      }

      await refresh(deps);
    },
    handleMove: async ({ deps, detail }) => {
      const { projectService } = deps;
      await projectService.ensureRepository();

      const move = resolveExplorerMove(detail);
      if (!move) {
        return;
      }

      await projectService.reorderLayoutItem({
        layoutId: move.itemId,
        parentId: move.parentId,
        position: move.repositoryPosition,
        positionTargetId: move.repositoryPositionTargetId,
      });

      await refresh(deps);
    },
  });
};

export const createLayoutElementsFileExplorerHandlers = ({
  getLayoutId,
  refresh = noopRefresh,
}) => {
  return createActionHandlers({
    handleAction: async ({ deps, detail }) => {
      const { appService, projectService } = deps;
      await projectService.ensureRepository();

      const layoutId = getLayoutId(deps);
      if (!layoutId) {
        appService.showToast("Layout is missing.");
        return;
      }

      const menuItem = resolveMenuItem(detail);
      const action = menuItem?.value;
      const itemId = detail.itemId;
      if (action === "rename-item-confirmed") {
        if (!itemId || !detail.newName) {
          return;
        }

        await projectService.updateLayoutElement({
          layoutId,
          elementId: itemId,
          data: {
            name: detail.newName,
          },
          replace: false,
        });
      } else if (action === "delete-item") {
        if (!itemId) {
          return;
        }

        await projectService.deleteLayoutElement({
          layoutId,
          elementIds: [itemId],
        });
      } else if (action === "new-item") {
        await projectService.createLayoutElement({
          layoutId,
          elementId: nanoid(),
          data: {
            type: "folder",
            name: "New Folder",
          },
          parentId: null,
          position: "last",
        });
      } else if (action === "new-child-folder") {
        if (!itemId) {
          return;
        }

        await projectService.createLayoutElement({
          layoutId,
          elementId: nanoid(),
          data: {
            type: "folder",
            name: "New Folder",
          },
          parentId: itemId,
          position: "last",
        });
      } else if (
        action &&
        typeof action === "object" &&
        action.action === "new-child-item"
      ) {
        const nextValue = {
          ...action,
          id: nanoid(),
        };
        delete nextValue.action;
        const { id: nextElementId, ...nextElementData } = nextValue;

        if (isTextElementType(nextValue.type)) {
          const firstTextStyleId = getFirstTextStyleId(state.textStyles);
          if (firstTextStyleId) {
            nextElementData.textStyleId = firstTextStyleId;
          }
        }

        await projectService.createLayoutElement({
          layoutId,
          elementId: nextElementId,
          data: nextElementData,
          parentId: itemId || null,
          position: "last",
        });
      } else {
        return;
      }

      await refresh(deps);
    },
    handleMove: async ({ deps, detail }) => {
      const { appService, projectService } = deps;
      await projectService.ensureRepository();

      const layoutId = getLayoutId(deps);
      if (!layoutId) {
        appService.showToast("Layout is missing.");
        return;
      }

      const move = resolveExplorerMove(detail);
      if (!move) {
        return;
      }

      await projectService.moveLayoutElement({
        layoutId,
        elementId: move.itemId,
        parentId: move.parentId,
        position: move.repositoryPosition,
        positionTargetId: move.repositoryPositionTargetId,
      });

      await refresh(deps);
    },
  });
};

export const createScenesFileExplorerHandlers = ({ refresh = noopRefresh }) => {
  return createActionHandlers({
    handleAction: async ({ deps, detail }) => {
      const { projectService } = deps;
      await projectService.ensureRepository();

      const menuItem = resolveMenuItem(detail);
      const action = menuItem?.value;
      const itemId = detail.itemId;

      if (action === "new-item") {
        await projectService.createSceneItem({
          sceneId: nanoid(),
          parentId: null,
          position: "last",
          data: {
            name: "New Folder",
            type: "folder",
          },
        });
      } else if (action === "new-child-folder") {
        if (!itemId) {
          return;
        }

        await projectService.createSceneItem({
          sceneId: nanoid(),
          parentId: itemId,
          position: "last",
          data: {
            name: "New Folder",
            type: "folder",
          },
        });
      } else if (action === "rename-item-confirmed") {
        if (!itemId || !detail.newName) {
          return;
        }

        await projectService.updateSceneItem({
          sceneId: itemId,
          data: {
            name: detail.newName,
          },
        });
      } else if (action === "delete-item") {
        if (!itemId) {
          return;
        }

        await projectService.deleteSceneItem({
          sceneIds: [itemId],
        });
      } else {
        return;
      }

      await refresh(deps);
    },
    handleMove: async ({ deps, detail }) => {
      const { projectService } = deps;
      await projectService.ensureRepository();

      const move = resolveExplorerMove(detail);
      if (!move) {
        return;
      }

      await projectService.reorderSceneItem({
        sceneId: move.itemId,
        parentId: move.parentId,
        position: move.repositoryPosition,
      });

      await refresh(deps);
    },
  });
};

export const createVariablesFileExplorerHandlers = ({
  refresh = noopRefresh,
}) => {
  return createResourceFileExplorerHandlers({
    resourceType: "variables",
    refresh,
  });
};

export const createCharacterSpritesFileExplorerHandlers = ({
  getCharacterId,
  refresh = noopRefresh,
}) => {
  return createActionHandlers({
    handleAction: async ({ deps, detail }) => {
      const { appService, projectService } = deps;
      await projectService.ensureRepository();

      const characterId = getCharacterId(deps);
      if (!characterId) {
        appService.showToast("Character is missing.");
        return;
      }

      const menuItem = resolveMenuItem(detail);
      const action = menuItem?.value;
      const itemId = detail.itemId;
      if (action === "new-item") {
        await projectService.createCharacterSpriteItem({
          characterId,
          spriteId: nanoid(),
          position: "last",
          data: {
            type: "folder",
            name: "New Folder",
          },
        });
      } else if (action === "new-child-folder") {
        if (!itemId) {
          return;
        }

        await projectService.createCharacterSpriteItem({
          characterId,
          spriteId: nanoid(),
          parentId: itemId,
          position: "last",
          data: {
            type: "folder",
            name: "New Folder",
          },
        });
      } else if (action === "rename-item-confirmed") {
        if (!itemId || !detail.newName) {
          return;
        }

        await projectService.updateCharacterSpriteItem({
          characterId,
          spriteId: itemId,
          data: {
            name: detail.newName,
          },
        });
      } else if (action === "delete-item") {
        if (!itemId) {
          return;
        }

        const usage = recursivelyCheckResource({
          state,
          itemId,
          checkTargets: ["scenes", "layouts"],
        });
        if (usage.isUsed) {
          appService.showToast(
            "Cannot delete resource, it is currently in use.",
          );
          return;
        }

        await projectService.deleteCharacterSpriteItem({
          characterId,
          spriteIds: [itemId],
        });
      } else if (
        action &&
        typeof action === "object" &&
        action.action === "new-child-item"
      ) {
        const nextValue = {
          ...action,
          id: nanoid(),
        };
        delete nextValue.action;
        const { id: nextSpriteId, ...nextSpriteData } = nextValue;

        await projectService.createCharacterSpriteItem({
          characterId,
          spriteId: nextSpriteId,
          parentId: itemId ?? null,
          position: "last",
          data: nextSpriteData,
        });
      } else {
        return;
      }

      await refresh(deps);
    },
    handleMove: async ({ deps, detail }) => {
      const { appService, projectService } = deps;
      await projectService.ensureRepository();

      const characterId = getCharacterId(deps);
      if (!characterId) {
        appService.showToast("Character is missing.");
        return;
      }

      const move = resolveExplorerMove(detail);
      if (!move) {
        return;
      }

      await projectService.moveCharacterSpriteItem({
        characterId,
        spriteId: move.itemId,
        parentId: move.parentId ?? null,
        position: move.repositoryPosition,
        positionTargetId: move.repositoryPositionTargetId,
      });

      await refresh(deps);
    },
  });
};
