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
  copy,
} = {}) => {
  const groupLabel =
    typeof spriteGroupName === "string" && spriteGroupName.length > 0
      ? copy.spriteGroupInUseLabelWithName.replace(
          "{spriteGroupName}",
          spriteGroupName,
        )
      : copy.spriteGroupInUseLabelFallback;
  const locationParts = [];

  if (usage?.sceneName) {
    locationParts.push(
      copy.spriteGroupInUseScene.replace("{sceneName}", usage.sceneName),
    );
  }

  if (usage?.sectionName) {
    locationParts.push(
      copy.spriteGroupInUseSection.replace("{sectionName}", usage.sectionName),
    );
  }

  if (locationParts.length === 0) {
    return copy.spriteGroupInUseMessage.replace("{groupLabel}", groupLabel);
  }

  return copy.spriteGroupInUseMessageWithLocation
    .replace("{groupLabel}", groupLabel)
    .replace("{location}", locationParts.join(", "));
};
