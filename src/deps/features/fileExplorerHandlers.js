import { nanoid } from "nanoid";
import {
  getFirstTypographyId,
  getTypographyCount,
  getTypographyRemovalCount,
} from "../../constants/typography.js";
import {
  ROOT_TREE_PARENT_ID,
  deleteTreeItem,
  insertTreeItem,
  moveTreeItem,
  updateTreeItem,
} from "../../domain/treeMutations.js";
import { recursivelyCheckResource } from "../../utils/resourceUsageChecker.js";

const findNodeLocation = (nodes = [], targetId, parentId = "_root") => {
  for (const node of nodes) {
    if (!node || typeof node.id !== "string") {
      continue;
    }

    if (node.id === targetId) {
      return { parentId };
    }

    const childResult = findNodeLocation(
      node.children || [],
      targetId,
      node.id,
    );
    if (childResult) {
      return childResult;
    }
  }

  return null;
};

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
      repositoryPosition: { before: target.id },
    };
  }

  if (position === "below") {
    if (!target?.id) {
      return null;
    }

    return {
      itemId: source.id,
      parentId: target.parentId ?? null,
      repositoryPosition: { after: target.id },
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

const applyCharacterSpritesPatch = async ({
  projectService,
  characterId,
  patchFactory,
}) => {
  const { characters } = projectService.getState();
  const character = characters?.items?.[characterId];
  if (!character) {
    throw new Error(`Character '${characterId}' not found`);
  }

  const spritesState = structuredClone(
    character.sprites || { items: {}, tree: [] },
  );
  const nextSprites = patchFactory(spritesState);

  await projectService.updateResourceItem({
    resourceType: "characters",
    resourceId: characterId,
    patch: {
      sprites: nextSprites,
    },
  });
};

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

  if (currentItemType === "typography") {
    const typographyCount = getTypographyCount(state.typography);
    const removalCount = getTypographyRemovalCount(state.typography, itemId);
    if (typographyCount - removalCount < 1) {
      appService.showToast("At least one typography must remain.");
      return false;
    }
  }

  let checkTargets = ["scenes", "layouts"];
  if (currentItemType === "typography") {
    checkTargets = ["layouts"];
  } else if (currentItemType === "color" || currentItemType === "font") {
    checkTargets = ["typography"];
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
  refresh,
}) => {
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
        await projectService.createResourceItem({
          resourceType,
          resourceId: nanoid(),
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

        await projectService.createResourceItem({
          resourceType,
          resourceId: nanoid(),
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

        await projectService.updateResourceItem({
          resourceType,
          resourceId: itemId,
          patch: {
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

        await projectService.deleteResourceItem({
          resourceType,
          resourceId: itemId,
        });
      } else if (action === "duplicate-item") {
        if (!currentItem) {
          return;
        }

        const duplicateId = nanoid();
        const location = findNodeLocation(collection?.tree || [], itemId);
        const duplicateName =
          typeof currentItem.name === "string" && currentItem.name.length > 0
            ? `${currentItem.name} Copy`
            : "Copied Item";

        await projectService.duplicateResourceItem({
          resourceType,
          sourceId: itemId,
          newId: duplicateId,
          parentId: location?.parentId || null,
          position: { after: itemId },
          name: duplicateName,
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

        await projectService.createResourceItem({
          resourceType,
          resourceId: nextValue.id,
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

      await projectService.moveResourceItem({
        resourceType,
        resourceId: move.itemId,
        parentId: move.parentId,
        position: move.repositoryPosition,
      });

      await refresh(deps);
    },
  });
};

export const createLayoutsFileExplorerHandlers = ({ refresh }) => {
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
          layoutId: itemId,
        });
      } else if (action === "duplicate-item") {
        if (!currentItem || currentItem.type !== "layout") {
          return;
        }

        const duplicateId = nanoid();
        const location = findNodeLocation(collection?.tree || [], itemId);
        const duplicateName =
          typeof currentItem.name === "string" && currentItem.name.length > 0
            ? `${currentItem.name} Copy`
            : "Copied Layout";

        const layoutValue = structuredClone(currentItem);
        const {
          id: _layoutId,
          type: _layoutNodeType,
          name: _layoutName,
          layoutType,
          elements,
          parentId: _layoutParentId,
          ...layoutData
        } = layoutValue;

        await projectService.createLayoutItem({
          layoutId: duplicateId,
          name: duplicateName,
          layoutType: layoutType || "normal",
          elements: elements || { items: {}, tree: [] },
          parentId: location?.parentId || null,
          position: { after: itemId },
          data: layoutData,
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
      });

      await refresh(deps);
    },
  });
};

export const createLayoutElementsFileExplorerHandlers = ({
  getLayoutId,
  refresh,
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

      const state = projectService.getState();
      const layout = state?.layouts?.items?.[layoutId];
      const menuItem = resolveMenuItem(detail);
      const action = menuItem?.value;
      const itemId = detail.itemId;
      const currentItem = layout?.elements?.items?.[itemId];

      if (action === "rename-item-confirmed") {
        if (!itemId || !detail.newName) {
          return;
        }

        await projectService.updateLayoutElement({
          layoutId,
          elementId: itemId,
          patch: {
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
          elementId: itemId,
        });
      } else if (action === "new-item") {
        await projectService.createLayoutElement({
          layoutId,
          elementId: nanoid(),
          element: {
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
          element: {
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

        if (isTextElementType(nextValue.type)) {
          const firstTypographyId = getFirstTypographyId(state.typography);
          if (firstTypographyId) {
            nextValue.typographyId = firstTypographyId;
          }
        }

        await projectService.createLayoutElement({
          layoutId,
          elementId: nextValue.id,
          element: nextValue,
          parentId: itemId || null,
          position: "last",
        });
      } else if (action === "duplicate-item") {
        if (!currentItem) {
          return;
        }

        const duplicateId = nanoid();
        const location = findNodeLocation(layout?.elements?.tree || [], itemId);
        const duplicateValue = structuredClone(currentItem);
        delete duplicateValue.id;
        duplicateValue.name =
          typeof currentItem.name === "string" && currentItem.name.length > 0
            ? `${currentItem.name} Copy`
            : "Copied Item";

        await projectService.createLayoutElement({
          layoutId,
          elementId: duplicateId,
          element: duplicateValue,
          parentId: location?.parentId || null,
          position: { after: itemId },
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
      });

      await refresh(deps);
    },
  });
};

export const createScenesFileExplorerHandlers = ({ refresh }) => {
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

        await projectService.createSceneItem({
          sceneId: nanoid(),
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

        await projectService.renameSceneItem({
          sceneId: itemId,
          name: detail.newName,
        });
      } else if (action === "delete-item") {
        if (!itemId) {
          return;
        }

        await projectService.deleteSceneItem({
          sceneId: itemId,
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

export const createVariablesFileExplorerHandlers = ({ refresh }) => {
  return createActionHandlers({
    handleAction: async ({ deps, detail }) => {
      const { projectService } = deps;
      await projectService.ensureRepository();

      const state = projectService.getState();
      const menuItem = resolveMenuItem(detail);
      const action = menuItem?.value;
      const itemId = detail.itemId;
      const currentItem = state?.variables?.items?.[itemId];

      if (action === "new-item") {
        await projectService.createVariableItem({
          variableId: nanoid(),
          name: "New Folder",
          type: "folder",
          defaultValue: "",
          parentId: null,
          position: "last",
        });
      } else if (action === "new-child-folder") {
        if (!itemId) {
          return;
        }

        await projectService.createVariableItem({
          variableId: nanoid(),
          name: "New Folder",
          type: "folder",
          defaultValue: "",
          parentId: itemId,
          position: "last",
        });
      } else if (action === "rename-item-confirmed") {
        if (!itemId || !detail.newName) {
          return;
        }

        await projectService.updateVariableItem({
          variableId: itemId,
          patch: {
            name: detail.newName,
          },
        });
      } else if (action === "delete-item") {
        if (!itemId) {
          return;
        }

        await projectService.deleteVariableItem({
          variableId: itemId,
        });
      } else if (action === "duplicate-item") {
        if (!currentItem) {
          return;
        }

        const duplicateId = nanoid();
        const location = findNodeLocation(state?.variables?.tree || [], itemId);
        const duplicateName =
          typeof currentItem.name === "string" && currentItem.name.length > 0
            ? `${currentItem.name} Copy`
            : "Copied Item";

        await projectService.createVariableItem({
          variableId: duplicateId,
          name: duplicateName,
          scope: currentItem.scope || "global",
          type: currentItem.type || "string",
          defaultValue:
            currentItem.type === "folder" ? "" : (currentItem.default ?? ""),
          parentId: location?.parentId || null,
          position: { after: itemId },
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

      await projectService.updateVariableItem({
        variableId: move.itemId,
        patch: {
          parentId: move.parentId,
        },
        position: move.repositoryPosition,
      });

      await refresh(deps);
    },
  });
};

export const createCharacterSpritesFileExplorerHandlers = ({
  getCharacterId,
  refresh,
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

      const state = projectService.getState();
      const character = state?.characters?.items?.[characterId];
      const sprites = character?.sprites || { items: {}, tree: [] };
      const menuItem = resolveMenuItem(detail);
      const action = menuItem?.value;
      const itemId = detail.itemId;
      const currentItem = sprites.items?.[itemId];

      if (action === "new-item") {
        await applyCharacterSpritesPatch({
          projectService,
          characterId,
          patchFactory: (spritesState) =>
            insertTreeItem({
              treeCollection: spritesState,
              value: {
                id: nanoid(),
                type: "folder",
                name: "New Folder",
              },
              parentId: ROOT_TREE_PARENT_ID,
              position: "last",
            }),
        });
      } else if (action === "new-child-folder") {
        if (!itemId) {
          return;
        }

        await applyCharacterSpritesPatch({
          projectService,
          characterId,
          patchFactory: (spritesState) =>
            insertTreeItem({
              treeCollection: spritesState,
              value: {
                id: nanoid(),
                type: "folder",
                name: "New Folder",
              },
              parentId: itemId,
              position: "last",
            }),
        });
      } else if (action === "rename-item-confirmed") {
        if (!itemId || !detail.newName) {
          return;
        }

        await applyCharacterSpritesPatch({
          projectService,
          characterId,
          patchFactory: (spritesState) =>
            updateTreeItem({
              treeCollection: spritesState,
              id: itemId,
              value: {
                name: detail.newName,
              },
              replace: false,
            }),
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

        await applyCharacterSpritesPatch({
          projectService,
          characterId,
          patchFactory: (spritesState) =>
            deleteTreeItem({
              treeCollection: spritesState,
              id: itemId,
            }),
        });
      } else if (action === "duplicate-item") {
        if (!currentItem) {
          return;
        }

        const duplicateId = nanoid();
        const location = findNodeLocation(sprites.tree || [], itemId);
        const duplicateName =
          typeof currentItem.name === "string" && currentItem.name.length > 0
            ? `${currentItem.name} Copy`
            : "Copied Item";

        await applyCharacterSpritesPatch({
          projectService,
          characterId,
          patchFactory: (spritesState) =>
            insertTreeItem({
              treeCollection: spritesState,
              value: {
                ...structuredClone(currentItem),
                id: duplicateId,
                name: duplicateName,
              },
              parentId: location?.parentId || ROOT_TREE_PARENT_ID,
              position: { after: itemId },
            }),
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

        await applyCharacterSpritesPatch({
          projectService,
          characterId,
          patchFactory: (spritesState) =>
            insertTreeItem({
              treeCollection: spritesState,
              value: nextValue,
              parentId: itemId || ROOT_TREE_PARENT_ID,
              position: "last",
            }),
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

      await applyCharacterSpritesPatch({
        projectService,
        characterId,
        patchFactory: (spritesState) =>
          moveTreeItem({
            treeCollection: spritesState,
            id: move.itemId,
            parentId: move.parentId || ROOT_TREE_PARENT_ID,
            position: move.repositoryPosition,
          }),
      });

      await refresh(deps);
    },
  });
};
