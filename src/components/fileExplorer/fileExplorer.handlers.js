import { nanoid } from "nanoid";
import {
  getFirstTypographyId,
  getTypographyCount,
  getTypographyRemovalCount,
} from "../../constants/typography.js";
import {
  nodeDelete,
  nodeInsert,
  nodeMove,
  nodeUpdate,
} from "../../deps/infra/domainStructure/actions.js";
import { recursivelyCheckResource } from "../../utils/resourceUsageChecker.js";

const lodashGet = (obj, path, defaultValue) => {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current && Object.prototype.hasOwnProperty.call(current, part)) {
      current = current[part];
    } else {
      return defaultValue;
    }
  }
  return current !== undefined ? current : defaultValue;
};

const findNodeLocation = (nodes = [], targetId, parentId = "_root") => {
  for (const node of nodes) {
    if (!node || typeof node.id !== "string") continue;
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

const TYPED_RESOURCE_TARGETS = new Set([
  "images",
  "tweens",
  "videos",
  "sounds",
  "characters",
  "fonts",
  "transforms",
  "colors",
  "typography",
  "components",
]);

const isTypedResourceTarget = (repositoryTarget) =>
  TYPED_RESOURCE_TARGETS.has(repositoryTarget);

const parseLayoutElementsTarget = (repositoryTarget) => {
  const match = /^layouts\.items\.([^.]+)\.elements$/.exec(
    String(repositoryTarget || ""),
  );
  if (!match) return null;
  return { layoutId: match[1] };
};

const isLayoutsTarget = (repositoryTarget) => repositoryTarget === "layouts";
const isScenesTarget = (repositoryTarget) => repositoryTarget === "scenes";
const isVariablesTarget = (repositoryTarget) =>
  repositoryTarget === "variables";

const parseCharacterSpritesTarget = (repositoryTarget) => {
  const match = /^characters\.items\.([^.]+)\.sprites$/.exec(
    String(repositoryTarget || ""),
  );
  if (!match) return null;
  return { characterId: match[1] };
};

const applyCharacterSpritesPatch = async ({
  projectService,
  characterId,
  patchFactory,
}) => {
  const state = projectService.getState();
  const character = state?.characters?.items?.[characterId];
  if (!character) {
    throw new Error(`Character '${characterId}' not found`);
  }

  const spritesState = structuredClone(
    character.sprites || { items: {}, order: [] },
  );
  const nextSprites = patchFactory(spritesState);

  await projectService.updateResourceItem({
    resourceType: "characters",
    resourceId: characterId,
    patch: {
      sprites: nextSprites,
    },
  });

  return nextSprites;
};

const getDetailItemId = (detail = {}) => {
  return detail.id || detail.itemId || detail.item?.id || "";
};

// Forward click-item event from base component
export const handleClickItem = async (deps, payload) => {
  const { dispatchEvent, projectService, props } = deps;
  await projectService.ensureRepository();
  const state = projectService.getState();
  const detail = payload._event.detail || {};
  const id = getDetailItemId(detail);
  if (!id) {
    return;
  }

  // Get the clicked item from the repository based on repositoryTarget
  const repositoryTarget = props.repositoryTarget;
  if (!repositoryTarget) {
    throw new Error(
      "REQUIRED: repositoryTarget prop is missing! Please pass .repositoryTarget=targetName to fileExplorer component",
    );
  }

  const targetData = lodashGet(state, repositoryTarget);
  const selectedItem =
    targetData && targetData.items ? targetData.items[id] : null;

  // Forward the event with enhanced detail containing item data
  dispatchEvent(
    new CustomEvent("item-click", {
      detail: {
        ...detail,
        id,
        itemId: id,
        item: selectedItem,
        repositoryTarget,
        isFolder: selectedItem && selectedItem.type === "folder",
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleDblClickItem = async (deps, payload) => {
  const { dispatchEvent, projectService, props } = deps;
  await projectService.ensureRepository();
  const state = projectService.getState();
  const { itemId } = payload._event.detail;

  // Get the clicked item from the repository based on repositoryTarget
  const repositoryTarget = props.repositoryTarget;
  if (!repositoryTarget) {
    throw new Error(
      "REQUIRED: repositoryTarget prop is missing! Please pass .repositoryTarget=targetName to fileExplorer component",
    );
  }

  const targetData = lodashGet(state, repositoryTarget);
  const selectedItem =
    targetData && targetData.items ? targetData.items[itemId] : null;

  // Forward the event with enhanced detail containing item data
  dispatchEvent(
    new CustomEvent("dblclick-item", {
      detail: {
        ...payload._event.detail,
        item: selectedItem,
        repositoryTarget,
        isFolder: selectedItem && selectedItem.type === "folder",
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handlePageItemClick = (deps, payload) => {
  const { refs } = deps;
  const { baseFileExplorer } = refs;
  baseFileExplorer.transformedHandlers.handlePageItemClick(payload);
};

export const handleFileAction = async (deps, payload) => {
  const { dispatchEvent, projectService, appService, props, render } = deps;
  await projectService.ensureRepository();
  const detail = payload._event.detail;
  const repositoryTarget = props.repositoryTarget;

  if (!repositoryTarget) {
    throw new Error(
      "REQUIRED: repositoryTarget prop is missing! Please pass .repositoryTarget=targetName to fileExplorer component",
    );
  }

  const state = projectService.getState();
  const layoutElementsTarget = parseLayoutElementsTarget(repositoryTarget);
  const characterSpritesTarget = parseCharacterSpritesTarget(repositoryTarget);
  const targetData = lodashGet(state, repositoryTarget);

  // Extract the actual item from the detail (rtgl-dropdown-menu adds index)
  const item = detail.item || detail;
  const itemId = detail.itemId;
  const currentItem =
    targetData && targetData.items ? targetData.items[itemId] : null;
  const isCurrentFolder = currentItem?.type === "folder";

  if (item.value === "new-item") {
    if (isTypedResourceTarget(repositoryTarget)) {
      await projectService.createResourceItem({
        resourceType: repositoryTarget,
        resourceId: nanoid(),
        data: {
          type: "folder",
          name: "New Folder",
        },
        parentId: null,
        position: "last",
      });
    } else if (layoutElementsTarget) {
      await projectService.createLayoutElement({
        layoutId: layoutElementsTarget.layoutId,
        elementId: nanoid(),
        element: {
          type: "folder",
          name: "New Folder",
        },
        parentId: null,
        position: "last",
      });
    } else if (characterSpritesTarget) {
      await applyCharacterSpritesPatch({
        projectService,
        characterId: characterSpritesTarget.characterId,
        patchFactory: (spritesState) =>
          nodeInsert({
            state: spritesState,
            payload: {
              value: {
                id: nanoid(),
                type: "folder",
                name: "New Folder",
              },
              options: {
                parent: "_root",
                position: "last",
              },
            },
          }),
      });
    } else {
      console.warn(
        "[routevn.collab.migration] unsupported new-item target (legacy folder tree disabled)",
        { repositoryTarget },
      );
      appService?.showToast?.(
        "Folder creation is not supported for this target.",
      );
      return;
    }
  } else if (item.value === "add-container") {
    if (layoutElementsTarget) {
      await projectService.createLayoutElement({
        layoutId: layoutElementsTarget.layoutId,
        elementId: nanoid(),
        element: {
          type: "container",
          name: "Container",
        },
        parentId: null,
        position: "last",
      });
    } else {
      console.warn(
        "[routevn.collab.migration] unsupported add-container target",
        { repositoryTarget },
      );
      return;
    }
  } else if (item.value === "add-sprite") {
    if (layoutElementsTarget) {
      await projectService.createLayoutElement({
        layoutId: layoutElementsTarget.layoutId,
        elementId: nanoid(),
        element: {
          type: "sprite",
          name: "Sprite",
        },
        parentId: null,
        position: "last",
      });
    } else {
      console.warn("[routevn.collab.migration] unsupported add-sprite target", {
        repositoryTarget,
      });
      return;
    }
  } else if (item.value === "add-text") {
    const firstTypographyId = getFirstTypographyId(state.typography);
    if (layoutElementsTarget) {
      await projectService.createLayoutElement({
        layoutId: layoutElementsTarget.layoutId,
        elementId: nanoid(),
        element: {
          type: "text",
          name: "Text",
          ...(firstTypographyId ? { typographyId: firstTypographyId } : {}),
        },
        parentId: null,
        position: "last",
      });
    } else {
      console.warn("[routevn.collab.migration] unsupported add-text target", {
        repositoryTarget,
      });
      return;
    }
  } else if (item.value === "rename-item-confirmed") {
    // Handle rename confirmation from popover form
    if (itemId && detail.newName) {
      if (isTypedResourceTarget(repositoryTarget)) {
        await projectService.updateResourceItem({
          resourceType: repositoryTarget,
          resourceId: itemId,
          patch: {
            name: detail.newName,
          },
        });
      } else if (layoutElementsTarget) {
        await projectService.updateLayoutElement({
          layoutId: layoutElementsTarget.layoutId,
          elementId: itemId,
          patch: {
            name: detail.newName,
          },
          replace: false,
        });
      } else if (
        isLayoutsTarget(repositoryTarget) &&
        currentItem?.type === "layout"
      ) {
        await projectService.renameLayoutItem({
          layoutId: itemId,
          name: detail.newName,
        });
      } else if (
        isScenesTarget(repositoryTarget) &&
        currentItem?.type === "scene"
      ) {
        await projectService.renameSceneItem({
          sceneId: itemId,
          name: detail.newName,
        });
      } else if (
        isVariablesTarget(repositoryTarget) &&
        currentItem &&
        !isCurrentFolder
      ) {
        await projectService.updateVariableItem({
          variableId: itemId,
          patch: {
            name: detail.newName,
          },
        });
      } else if (characterSpritesTarget) {
        await applyCharacterSpritesPatch({
          projectService,
          characterId: characterSpritesTarget.characterId,
          patchFactory: (spritesState) =>
            nodeUpdate({
              state: spritesState,
              payload: {
                value: {
                  name: detail.newName,
                },
                options: {
                  id: itemId,
                  replace: false,
                },
              },
            }),
        });
      } else {
        console.warn(
          "[routevn.collab.migration] unsupported rename target (legacy folder tree disabled)",
          { repositoryTarget, itemId },
        );
        appService?.showToast?.("Rename is not supported for this target.");
        return;
      }
    }
  } else if (item.value === "delete-item") {
    if (currentItem) {
      const resourceType = currentItem.type;

      let checkTargets;
      if (resourceType === "character") {
        let isUsed = false;
        if (currentItem.sprites && currentItem.sprites.items) {
          for (const spriteId of Object.keys(currentItem.sprites.items)) {
            const usage = recursivelyCheckResource({
              state,
              itemId: spriteId,
              checkTargets: ["scenes", "layouts"],
            });
            if (usage.isUsed) {
              isUsed = true;
              break;
            }
          }
        }
        if (isUsed) {
          appService.showToast(
            "Cannot delete resource, it is currently in use.",
          );
          render();
          return;
        }
      } else if (resourceType === "layout") {
        checkTargets = ["scenes"];
      } else if (resourceType === "typography") {
        const typographyCount = getTypographyCount(state.typography);
        const removalCount = getTypographyRemovalCount(
          state.typography,
          itemId,
        );
        if (typographyCount - removalCount < 1) {
          appService.showToast("At least one typography must remain.");
          render();
          return;
        }
        checkTargets = ["layouts"];
      } else if (resourceType === "color" || resourceType === "font") {
        checkTargets = ["typography"];
      } else {
        checkTargets = ["scenes", "layouts"];
      }

      if (checkTargets) {
        const usage = recursivelyCheckResource({
          state,
          itemId,
          checkTargets,
        });
        if (usage.isUsed) {
          appService.showToast(
            "Cannot delete resource, it is currently in use.",
          );
          render();
          return;
        }
      }

      if (isTypedResourceTarget(repositoryTarget)) {
        await projectService.deleteResourceItem({
          resourceType: repositoryTarget,
          resourceId: itemId,
        });
      } else if (layoutElementsTarget) {
        await projectService.deleteLayoutElement({
          layoutId: layoutElementsTarget.layoutId,
          elementId: itemId,
        });
      } else if (
        isLayoutsTarget(repositoryTarget) &&
        currentItem.type === "layout"
      ) {
        await projectService.deleteLayoutItem({
          layoutId: itemId,
        });
      } else if (
        isScenesTarget(repositoryTarget) &&
        currentItem.type === "scene"
      ) {
        await projectService.deleteSceneItem({
          sceneId: itemId,
        });
      } else if (isVariablesTarget(repositoryTarget) && !isCurrentFolder) {
        await projectService.deleteVariableItem({
          variableId: itemId,
        });
      } else if (characterSpritesTarget) {
        await applyCharacterSpritesPatch({
          projectService,
          characterId: characterSpritesTarget.characterId,
          patchFactory: (spritesState) =>
            nodeDelete({
              state: spritesState,
              payload: {
                options: {
                  id: itemId,
                },
              },
            }),
        });
      } else {
        console.warn(
          "[routevn.collab.migration] unsupported delete target (legacy folder tree disabled)",
          { repositoryTarget, itemId },
        );
        appService?.showToast?.("Delete is not supported for this target.");
        return;
      }
    }
  } else if (item.value === "new-child-folder") {
    if (currentItem) {
      if (isTypedResourceTarget(repositoryTarget)) {
        await projectService.createResourceItem({
          resourceType: repositoryTarget,
          resourceId: nanoid(),
          data: {
            type: "folder",
            name: "New Folder",
          },
          parentId: itemId,
          position: "last",
        });
      } else if (layoutElementsTarget) {
        await projectService.createLayoutElement({
          layoutId: layoutElementsTarget.layoutId,
          elementId: nanoid(),
          element: {
            type: "folder",
            name: "New Folder",
          },
          parentId: itemId,
          position: "last",
        });
      } else if (characterSpritesTarget) {
        await applyCharacterSpritesPatch({
          projectService,
          characterId: characterSpritesTarget.characterId,
          patchFactory: (spritesState) =>
            nodeInsert({
              state: spritesState,
              payload: {
                value: {
                  id: nanoid(),
                  type: "folder",
                  name: "New Folder",
                },
                options: {
                  parent: itemId,
                  position: "last",
                },
              },
            }),
        });
      } else {
        console.warn(
          "[routevn.collab.migration] unsupported new-child-folder target (legacy folder tree disabled)",
          { repositoryTarget, itemId },
        );
        appService?.showToast?.(
          "Child folder creation is not supported for this target.",
        );
        return;
      }
    }
  } else if (item.value.action === "new-child-item") {
    const { ...restItem } = item.value;
    const value = {
      ...restItem,
      id: nanoid(),
    };

    if (isTextElementType(value.type)) {
      const firstTypographyId = getFirstTypographyId(state.typography);
      if (firstTypographyId) {
        value.typographyId = firstTypographyId;
      }
    }

    if (isTypedResourceTarget(repositoryTarget)) {
      await projectService.createResourceItem({
        resourceType: repositoryTarget,
        resourceId: value.id,
        data: value,
        parentId: itemId || null,
        position: "last",
      });
    } else if (layoutElementsTarget) {
      await projectService.createLayoutElement({
        layoutId: layoutElementsTarget.layoutId,
        elementId: value.id,
        element: value,
        parentId: itemId || null,
        position: "last",
      });
    } else if (characterSpritesTarget) {
      await applyCharacterSpritesPatch({
        projectService,
        characterId: characterSpritesTarget.characterId,
        patchFactory: (spritesState) =>
          nodeInsert({
            state: spritesState,
            payload: {
              value,
              options: {
                parent: itemId || "_root",
                position: "last",
              },
            },
          }),
      });
    } else {
      console.warn(
        "[routevn.collab.migration] unsupported new-child-item target",
        {
          repositoryTarget,
          itemId,
        },
      );
      return;
    }
  } else if (item.value === "duplicate-item") {
    if (!currentItem) {
      return;
    }

    const duplicateId = nanoid();
    const location = findNodeLocation(targetData?.order || [], itemId);
    const duplicateName =
      typeof currentItem.name === "string" && currentItem.name.length > 0
        ? `${currentItem.name} Copy`
        : "Copied Item";

    // Duplicate in the same parent and place it right after the original node
    if (isTypedResourceTarget(repositoryTarget)) {
      await projectService.duplicateResourceItem({
        resourceType: repositoryTarget,
        sourceId: itemId,
        newId: duplicateId,
        parentId: location?.parentId || null,
        position: { after: itemId },
        name: duplicateName,
      });
    } else if (layoutElementsTarget) {
      const duplicateValue = structuredClone(currentItem);
      delete duplicateValue.id;
      duplicateValue.name = duplicateName;
      await projectService.createLayoutElement({
        layoutId: layoutElementsTarget.layoutId,
        elementId: duplicateId,
        element: duplicateValue,
        parentId: location?.parentId || null,
        position: { after: itemId },
      });
    } else if (
      isLayoutsTarget(repositoryTarget) &&
      currentItem.type === "layout"
    ) {
      const layoutValue = structuredClone(currentItem);
      const {
        id: _layoutId,
        type: _layoutTypeNode,
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
        elements: elements || { items: {}, order: [] },
        parentId: location?.parentId || null,
        position: { after: itemId },
        data: layoutData,
      });
    } else if (isVariablesTarget(repositoryTarget) && !isCurrentFolder) {
      await projectService.createVariableItem({
        variableId: duplicateId,
        name: duplicateName,
        scope: currentItem.scope || "global",
        type: currentItem.type || "string",
        defaultValue: currentItem.default ?? "",
        parentId: location?.parentId || null,
        position: { after: itemId },
      });
    } else if (characterSpritesTarget) {
      await applyCharacterSpritesPatch({
        projectService,
        characterId: characterSpritesTarget.characterId,
        patchFactory: (spritesState) =>
          nodeInsert({
            state: spritesState,
            payload: {
              value: {
                ...structuredClone(currentItem),
                id: duplicateId,
                name: duplicateName,
              },
              options: {
                parent: location?.parentId || "_root",
                position: { after: itemId },
              },
            },
          }),
      });
    } else {
      console.warn(
        "[routevn.collab.migration] unsupported duplicate target (legacy folder tree disabled)",
        { repositoryTarget, itemId },
      );
      return;
    }
  }

  // Emit data-changed event after any repository action
  dispatchEvent(
    new CustomEvent("data-changed", {
      detail: { target: repositoryTarget },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleTargetChanged = async (deps, payload) => {
  const { dispatchEvent, projectService, props } = deps;
  await projectService.ensureRepository();
  const repositoryTarget = props.repositoryTarget;
  const layoutElementsTarget = parseLayoutElementsTarget(repositoryTarget);
  const characterSpritesTarget = parseCharacterSpritesTarget(repositoryTarget);

  if (!repositoryTarget) {
    throw new Error(
      "REQUIRED: repositoryTarget prop is missing! Please pass .repositoryTarget=targetName to fileExplorer component",
    );
  }

  const { target, source, position } = payload._event.detail;

  if (!source || !source.id) {
    console.warn("No source item provided");
    return;
  }

  let repositoryPosition;
  let parent;

  if (position === "inside") {
    // Drop inside a folder
    if (!target || target.type !== "folder") {
      console.warn("Cannot drop inside non-folder item");
      return;
    }
    parent = target.id;
    repositoryPosition = "last"; // Add to end of folder
  } else if (position === "above") {
    // Drop above target item
    if (!target || !target.id) {
      console.warn("No target item for above position");
      return;
    }
    parent = target.parentId || "_root";
    repositoryPosition = { before: target.id };
  } else if (position === "below") {
    // Drop below target item
    if (!target || !target.id) {
      console.warn("No target item for below position");
      return;
    }
    parent = target.parentId || "_root";
    repositoryPosition = { after: target.id };
  } else {
    console.warn("Unknown drop position:", position);
    return;
  }

  if (isTypedResourceTarget(repositoryTarget)) {
    await projectService.moveResourceItem({
      resourceType: repositoryTarget,
      resourceId: source.id,
      parentId: parent,
      position: repositoryPosition,
    });
  } else if (layoutElementsTarget) {
    await projectService.moveLayoutElement({
      layoutId: layoutElementsTarget.layoutId,
      elementId: source.id,
      parentId: parent,
      position: repositoryPosition,
    });
  } else if (isScenesTarget(repositoryTarget) && source.type === "scene") {
    await projectService.reorderSceneItem({
      sceneId: source.id,
      parentId: parent,
      position: repositoryPosition,
    });
  } else if (characterSpritesTarget) {
    await applyCharacterSpritesPatch({
      projectService,
      characterId: characterSpritesTarget.characterId,
      patchFactory: (spritesState) =>
        nodeMove({
          state: spritesState,
          payload: {
            options: {
              id: source.id,
              parent: parent,
              position: repositoryPosition,
            },
          },
        }),
    });
  } else {
    console.warn(
      "[routevn.collab.migration] unsupported move target (legacy folder tree disabled)",
      { repositoryTarget, sourceId: source.id },
    );
    return;
  }

  // Emit data-changed event after repository action
  dispatchEvent(
    new CustomEvent("data-changed", {
      detail: { target: repositoryTarget },
      bubbles: true,
      composed: true,
    }),
  );
};
