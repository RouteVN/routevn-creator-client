import { normalizeLineActions } from "../../../internal/project/engineActions.js";

const hasSpriteGroupReference = ({ line, characterId, spriteGroupId } = {}) => {
  const lineActions = normalizeLineActions(line?.actions ?? {});
  const characterItems = Array.isArray(lineActions.character?.items)
    ? lineActions.character.items
    : [];

  return characterItems.some((characterItem) => {
    if (characterItem?.id !== characterId) {
      return false;
    }

    return Array.isArray(characterItem?.sprites)
      ? characterItem.sprites.some((sprite) => sprite?.id === spriteGroupId)
      : false;
  });
};

export const findSpriteGroupUsage = ({
  repositoryState,
  characterId,
  spriteGroupId,
} = {}) => {
  if (
    typeof characterId !== "string" ||
    characterId.length === 0 ||
    typeof spriteGroupId !== "string" ||
    spriteGroupId.length === 0
  ) {
    return undefined;
  }

  for (const scene of Object.values(repositoryState?.scenes?.items ?? {})) {
    if (scene?.type !== "scene") {
      continue;
    }

    for (const section of Object.values(scene.sections?.items ?? {})) {
      if (section?.type !== "section") {
        continue;
      }

      for (const line of Object.values(section.lines?.items ?? {})) {
        if (
          hasSpriteGroupReference({
            line,
            characterId,
            spriteGroupId,
          })
        ) {
          return {
            sceneId: scene.id,
            sceneName: scene.name ?? "",
            sectionId: section.id,
            sectionName: section.name ?? "",
            lineId: line.id,
          };
        }
      }
    }
  }

  return undefined;
};

export const buildSpriteGroupInUseMessage = ({
  spriteGroupName,
  usage,
} = {}) => {
  const groupLabel =
    typeof spriteGroupName === "string" && spriteGroupName.length > 0
      ? `Sprite group "${spriteGroupName}"`
      : "This sprite group";
  const locationParts = [];

  if (usage?.sceneName) {
    locationParts.push(`scene "${usage.sceneName}"`);
  }

  if (usage?.sectionName) {
    locationParts.push(`section "${usage.sectionName}"`);
  }

  if (locationParts.length === 0) {
    return `${groupLabel} is used in story lines and can't be removed. Remove it from those lines first.`;
  }

  return `${groupLabel} is used in ${locationParts.join(", ")} and can't be removed. Remove it from those lines first.`;
};
