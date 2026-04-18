import { generateId } from "../id.js";
import {
  getFirstTextStyleId,
  getTextStyleCount,
  getTextStyleRemovalCount,
} from "../../constants/textStyles.js";
import { canItemReceiveChildren } from "../fileExplorerDragOptions.js";
import { recursivelyCheckResource } from "../project/projection.js";

const isTextElementType = (type) =>
  [
    "text",
    "text-revealing",
    "text-ref-character-name",
    "text-revealing-ref-dialogue-content",
    "text-ref-choice-item-content",
    "text-ref-save-load-slot-date",
    "text-ref-dialogue-line-character-name",
    "text-ref-dialogue-line-content",
  ].includes(type);

const getResultErrorMessage = (result, fallbackMessage) => {
  return (
    result?.error?.message ||
    result?.error?.creatorModelError?.message ||
    fallbackMessage
  );
};

const resolveMenuItem = (detail = {}) => detail.item || detail;

const resolveExplorerMove = (detail = {}) => {
  const { position, source, target } = detail;
  if (!source?.id) {
    return null;
  }

  if (position === "inside") {
    if (!canItemReceiveChildren(target)) {
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
  spritesheets: {
    createMethod: "createSpritesheet",
    updateMethod: "updateSpritesheet",
    moveMethod: "moveSpritesheet",
    deleteMethod: "deleteSpritesheets",
    idField: "spritesheetId",
    deleteField: "spritesheetIds",
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
    duplicateMethod: "duplicateAnimation",
    idField: "animationId",
    deleteField: "animationIds",
  },
  particles: {
    createMethod: "createParticle",
    updateMethod: "updateParticle",
    moveMethod: "moveParticle",
    deleteMethod: "deleteParticles",
    idField: "particleId",
    deleteField: "particleIds",
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
    duplicateMethod: "duplicateTextStyle",
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
  controls: {
    createMethod: "createControlItem",
    updateMethod: "updateControlItem",
    moveMethod: "reorderControlItem",
    deleteMethod: "deleteControlItem",
    idField: "controlId",
    deleteField: "controlIds",
  },
});

const getDeletionBlockedMessage = ({ itemType, reason } = {}) => {
  if (reason === "minimum-text-style") {
    return "At least one text style must remain.";
  }

  if (reason === "in-use") {
    return itemType === "folder"
      ? "Cannot delete folder. There are items in use."
      : "Cannot delete resource, it is currently in use.";
  }

  return "Failed to delete resource.";
};

const checkResourceUsage = async ({
  projectService,
  state,
  itemId,
  checkTargets = [],
}) => {
  if (checkTargets.includes("scenes")) {
    return projectService.checkResourceUsage({
      itemId,
      checkTargets,
    });
  }

  return recursivelyCheckResource({
    state,
    itemId,
    checkTargets,
  });
};

const validateResourceDeletion = async ({
  projectService,
  resourceType,
  currentItem,
  itemId,
}) => {
  const state = projectService.getState();
  const currentItemType = currentItem?.type;
  const collection = state?.[resourceType];

  if (currentItemType === "folder") {
    const descendantIds = [];
    const pendingParentIds = [itemId];

    while (pendingParentIds.length > 0) {
      const parentId = pendingParentIds.shift();

      for (const [childId, childItem] of Object.entries(
        collection?.items ?? {},
      )) {
        if (childItem?.parentId !== parentId) {
          continue;
        }

        descendantIds.push(childId);
        pendingParentIds.push(childId);
      }
    }

    for (const descendantId of descendantIds) {
      const descendantItem = collection?.items?.[descendantId];
      if (!descendantItem || descendantItem.type === "folder") {
        continue;
      }

      const descendantDeletion = await validateResourceDeletion({
        projectService,
        resourceType,
        currentItem: descendantItem,
        itemId: descendantId,
      });
      if (!descendantDeletion.canDelete) {
        return descendantDeletion;
      }
    }

    return { canDelete: true };
  }

  if (currentItemType === "character") {
    if (currentItem?.sprites?.items) {
      for (const spriteId of Object.keys(currentItem.sprites.items)) {
        const usage = await checkResourceUsage({
          projectService,
          state,
          itemId: spriteId,
          checkTargets: ["scenes", "layouts", "controls"],
        });

        if (usage.isUsed) {
          return { canDelete: false, reason: "in-use" };
        }
      }
    }
  }

  if (currentItemType === "textStyle") {
    const textStyleCount = getTextStyleCount(state.textStyles);
    const removalCount = getTextStyleRemovalCount(state.textStyles, itemId);
    if (textStyleCount - removalCount < 1) {
      return { canDelete: false, reason: "minimum-text-style" };
    }
  }

  let checkTargets = ["scenes", "layouts", "controls"];
  if (currentItemType === "textStyle") {
    checkTargets = ["layouts", "controls"];
  } else if (currentItemType === "color" || currentItemType === "font") {
    checkTargets = ["textStyles"];
  } else if (resourceType === "characters") {
    checkTargets = ["scenes", "layouts", "controls"];
  }

  const usage = await checkResourceUsage({
    projectService,
    state,
    itemId,
    checkTargets,
  });

  if (usage.isUsed) {
    return { canDelete: false, reason: "in-use" };
  }

  return { canDelete: true };
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
      let createdItemId;

      if (action === "new-item") {
        createdItemId = await projectService[resourceApi.createMethod]({
          [resourceApi.idField]: generateId(),
          data: {
            type: "folder",
            name: "New Folder",
          },
          parentId: null,
          position: "last",
        });
        if (createdItemId?.valid === false) {
          return;
        }
      } else if (action === "new-child-folder") {
        if (!itemId) {
          return;
        }

        createdItemId = await projectService[resourceApi.createMethod]({
          [resourceApi.idField]: generateId(),
          data: {
            type: "folder",
            name: "New Folder",
          },
          parentId: itemId,
          position: "last",
        });
        if (createdItemId?.valid === false) {
          return;
        }
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

        const deleteValidation = await validateResourceDeletion({
          projectService,
          resourceType,
          currentItem,
          itemId,
        });
        if (!deleteValidation.canDelete) {
          appService.showAlert({
            message: getDeletionBlockedMessage({
              itemType: currentItem?.type,
              reason: deleteValidation.reason,
            }),
          });
          return;
        }

        const deleteResult = await projectService[resourceApi.deleteMethod]({
          [resourceApi.deleteField]: [itemId],
        });
        if (deleteResult?.valid === false) {
          appService.showAlert({ message: "Failed to delete resource." });
          return;
        }

        await refresh(deps, { deletedItemId: itemId });
        return;
      } else if (action === "duplicate-item") {
        if (
          !itemId ||
          currentItem?.type === "folder" ||
          !resourceApi.duplicateMethod
        ) {
          return;
        }

        const duplicateItemId = await projectService[
          resourceApi.duplicateMethod
        ]({
          [resourceApi.idField]: itemId,
        });
        if (duplicateItemId?.valid === false) {
          appService.showAlert({
            message: getResultErrorMessage(
              duplicateItemId,
              "Failed to duplicate resource.",
            ),
            title: "Error",
          });
          return;
        }

        await refresh(deps, { selectedItemId: duplicateItemId });
        return;
      } else if (
        action &&
        typeof action === "object" &&
        action.action === "new-child-item"
      ) {
        const nextValue = {
          ...action,
          id: generateId(),
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

      await refresh(deps, { selectedItemId: createdItemId });
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
          layoutId: generateId(),
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
          layoutId: generateId(),
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

        const usage = await checkResourceUsage({
          projectService,
          state,
          itemId,
          checkTargets: ["scenes"],
        });

        if (usage.isUsed) {
          appService.showAlert({
            message: "Cannot delete resource, it is currently in use.",
          });
          return;
        }

        await projectService.deleteLayoutItem({
          layoutIds: [itemId],
        });
      } else if (action === "duplicate-item") {
        if (!itemId || currentItem?.type !== "layout") {
          return;
        }

        const duplicateLayoutId = await projectService.duplicateLayoutItem({
          layoutId: itemId,
        });
        if (duplicateLayoutId?.valid === false) {
          appService.showAlert({
            message: getResultErrorMessage(
              duplicateLayoutId,
              "Failed to duplicate layout.",
            ),
            title: "Error",
          });
          return;
        }

        await refresh(deps, { selectedItemId: duplicateLayoutId });
        return;
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

export const createControlsFileExplorerHandlers = ({
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
      const collection = state?.controls;
      const currentItem = collection?.items?.[itemId];

      if (action === "new-item") {
        await projectService.createControlItem({
          controlId: generateId(),
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

        await projectService.createControlItem({
          controlId: generateId(),
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

        await projectService.renameControlItem({
          controlId: itemId,
          name: detail.newName,
        });
      } else if (action === "delete-item") {
        if (!currentItem) {
          return;
        }

        const usage = await checkResourceUsage({
          projectService,
          state,
          itemId,
          checkTargets: ["scenes"],
        });

        if (usage.isUsed) {
          appService.showAlert({
            message: "Cannot delete resource, it is currently in use.",
          });
          return;
        }

        await projectService.deleteControlItem({
          controlIds: [itemId],
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

      await projectService.reorderControlItem({
        controlId: move.itemId,
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
  getResourceType = () => "layouts",
  refresh = noopRefresh,
}) => {
  return createActionHandlers({
    handleAction: async ({ deps, detail }) => {
      const { appService, projectService } = deps;
      await projectService.ensureRepository();
      const state = projectService.getState();

      const layoutId = getLayoutId(deps);
      const resourceType = getResourceType(deps);
      const isControls = resourceType === "controls";
      if (!layoutId) {
        appService.showAlert({
          message: isControls ? "Control is missing." : "Layout is missing.",
        });
        return;
      }

      const createElement = isControls
        ? projectService.createControlElement.bind(projectService)
        : projectService.createLayoutElement.bind(projectService);
      const updateElement = isControls
        ? projectService.updateControlElement.bind(projectService)
        : projectService.updateLayoutElement.bind(projectService);
      const deleteElement = isControls
        ? projectService.deleteControlElement.bind(projectService)
        : projectService.deleteLayoutElement.bind(projectService);
      const ownerPayloadKey = isControls ? "controlId" : "layoutId";

      const menuItem = resolveMenuItem(detail);
      const action = menuItem?.value;
      const itemId = detail.itemId;
      let createdItemId;
      if (action === "rename-item-confirmed") {
        if (!itemId || !detail.newName) {
          return;
        }

        await updateElement({
          [ownerPayloadKey]: layoutId,
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

        await deleteElement({
          [ownerPayloadKey]: layoutId,
          elementIds: [itemId],
        });
      } else if (action === "new-item") {
        createdItemId = generateId();
        await createElement({
          [ownerPayloadKey]: layoutId,
          elementId: createdItemId,
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

        createdItemId = generateId();
        await createElement({
          [ownerPayloadKey]: layoutId,
          elementId: createdItemId,
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
          id: generateId(),
        };
        delete nextValue.action;
        const { id: nextElementId, ...nextElementData } = nextValue;

        if (isTextElementType(nextValue.type)) {
          const firstTextStyleId = getFirstTextStyleId(state.textStyles);
          if (firstTextStyleId) {
            nextElementData.textStyleId = firstTextStyleId;
          }
        }

        const createResult = await createElement({
          [ownerPayloadKey]: layoutId,
          elementId: nextElementId,
          data: nextElementData,
          parentId: itemId || null,
          position: "last",
        });
        if (createResult?.valid === false) {
          appService.showAlert({
            message: getResultErrorMessage(
              createResult,
              "Failed to create element.",
            ),
            title: "Error",
          });
          console.error("Failed to create layout editor element:", {
            resourceType,
            layoutId,
            itemId,
            data: nextElementData,
            createResult,
          });
          return;
        }

        createdItemId = nextElementId;
      } else {
        return;
      }

      await refresh(deps, { selectedItemId: createdItemId });
    },
    handleMove: async ({ deps, detail }) => {
      const { appService, projectService } = deps;
      await projectService.ensureRepository();

      const layoutId = getLayoutId(deps);
      const resourceType = getResourceType(deps);
      const isControls = resourceType === "controls";
      if (!layoutId) {
        appService.showAlert({
          message: isControls ? "Control is missing." : "Layout is missing.",
        });
        return;
      }

      const moveElement = isControls
        ? projectService.moveControlElement.bind(projectService)
        : projectService.moveLayoutElement.bind(projectService);
      const ownerPayloadKey = isControls ? "controlId" : "layoutId";

      const move = resolveExplorerMove(detail);
      if (!move) {
        return;
      }

      await moveElement({
        [ownerPayloadKey]: layoutId,
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
      const { appService, projectService } = deps;
      await projectService.ensureRepository();

      const menuItem = resolveMenuItem(detail);
      const action = menuItem?.value;
      const itemId = detail.itemId;

      if (action === "new-item") {
        const createResult = await projectService.createSceneItem({
          sceneId: generateId(),
          parentId: null,
          position: "last",
          data: {
            name: "New Folder",
            type: "folder",
          },
        });
        if (createResult?.valid === false) {
          appService.showAlert({
            message: getResultErrorMessage(
              createResult,
              "Failed to create folder.",
            ),
          });
          return;
        }
      } else if (action === "new-child-folder") {
        if (!itemId) {
          return;
        }

        const createResult = await projectService.createSceneItem({
          sceneId: generateId(),
          parentId: itemId,
          position: "last",
          data: {
            name: "New Folder",
            type: "folder",
          },
        });
        if (createResult?.valid === false) {
          appService.showAlert({
            message: getResultErrorMessage(
              createResult,
              "Failed to create folder.",
            ),
          });
          return;
        }
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

        const deleteResult = await projectService.deleteSceneIfUnused({
          sceneId: itemId,
        });
        if (!deleteResult.deleted) {
          appService.showAlert({
            message: deleteResult.usage?.isUsed
              ? "Cannot delete resource, it is currently in use."
              : "Failed to delete resource.",
          });
          return;
        }
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

      const state = projectService.getState();
      const characterId = getCharacterId(deps);
      if (!characterId) {
        appService.showAlert({ message: "Character is missing." });
        return;
      }

      const menuItem = resolveMenuItem(detail);
      const action = menuItem?.value;
      const itemId = detail.itemId;
      if (action === "new-item") {
        await projectService.createCharacterSpriteItem({
          characterId,
          spriteId: generateId(),
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
          spriteId: generateId(),
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

        const usage = await checkResourceUsage({
          projectService,
          state,
          itemId,
          checkTargets: ["scenes", "layouts"],
        });
        if (usage.isUsed) {
          appService.showAlert({
            message: "Cannot delete resource, it is currently in use.",
          });
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
          id: generateId(),
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
        appService.showAlert({ message: "Character is missing." });
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
