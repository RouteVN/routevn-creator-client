import { toFlatItems } from "../../project/tree.js";
import { normalizeLineActions } from "../../project/engineActions.js";

const getLineChanges = (sectionLineChanges, lineId) => {
  const changesLines = sectionLineChanges?.lines || [];
  const lineChanges = changesLines.find((change) => change.id === lineId);
  return lineChanges?.changes || {};
};

const buildCharacterLookups = (repositoryState) => {
  const characterItems = repositoryState?.characters?.items || {};
  const flatCharacters = toFlatItems(repositoryState?.characters || []);
  const flatCharacterById = new Map(
    flatCharacters.map((character) => [character.id, character]),
  );

  return {
    characterItems,
    flatCharacterById,
  };
};

const resolveCharacterSpriteFileId = ({
  repositoryState,
  character,
  firstSprite,
}) => {
  if (!firstSprite?.resourceId || !character?.sprites) {
    return undefined;
  }

  const flatSprites = toFlatItems(character.sprites);
  const sprite = flatSprites.find((item) => item.id === firstSprite.resourceId);
  if (sprite?.fileId) {
    return sprite.fileId;
  }

  return repositoryState?.images?.items?.[firstSprite.resourceId]?.fileId;
};

const buildBackgroundPreview = (repositoryState, changes) => {
  if (!changes.background) {
    return undefined;
  }

  const backgroundData = changes.background.data || {};
  return {
    changeType: changes.background.changeType,
    resourceId: backgroundData.resourceId,
    fileId: repositoryState?.images?.items?.[backgroundData.resourceId]?.fileId,
  };
};

const buildCharacterSpritePreview = (
  repositoryState,
  changes,
  characterItems,
) => {
  if (!changes.character) {
    return undefined;
  }

  const characterData = changes.character.data || {};
  if (!Array.isArray(characterData.items) || characterData.items.length === 0) {
    return {
      changeType: changes.character.changeType,
      items: [],
    };
  }

  return {
    changeType: changes.character.changeType,
    items: characterData.items
      .map((characterChange) => {
        const character = characterItems[characterChange.id];
        return {
          characterId: characterChange.id,
          characterName: character?.name || "Unknown",
          fileId: resolveCharacterSpriteFileId({
            repositoryState,
            character,
            firstSprite: characterChange.sprites?.[0],
          }),
        };
      })
      .filter((item) => item.fileId),
  };
};

const resolveVisualPreviewFileId = ({ repositoryState, resourceId }) => {
  if (!resourceId) {
    return undefined;
  }

  const image = repositoryState?.images?.items?.[resourceId];
  if (image) {
    return image.thumbnailFileId || image.fileId;
  }

  const video = repositoryState?.videos?.items?.[resourceId];
  if (video) {
    return video.thumbnailFileId || video.fileId;
  }

  const layout = repositoryState?.layouts?.items?.[resourceId];
  if (layout) {
    return layout.thumbnailFileId || layout.fileId;
  }

  return undefined;
};

const buildVisualPreview = (repositoryState, changes) => {
  if (!changes.visual) {
    return undefined;
  }

  const visualData = changes.visual.data || {};
  if (!Array.isArray(visualData.items) || visualData.items.length === 0) {
    return {
      changeType: changes.visual.changeType,
      items: [],
    };
  }

  return {
    changeType: changes.visual.changeType,
    items: visualData.items
      .map((visualChange) => ({
        visualId: visualChange.id,
        resourceId: visualChange.resourceId,
        fileId: resolveVisualPreviewFileId({
          repositoryState,
          resourceId: visualChange.resourceId,
        }),
      }))
      .filter((item) => item.fileId),
  };
};

const buildSectionTransitionPreview = (line) => {
  const lineActions = normalizeLineActions(line.actions || {});
  const transitionData = lineActions?.sectionTransition;
  if (!transitionData) {
    return false;
  }

  return !!transitionData.sectionId || !!transitionData.sceneId;
};

const buildChoicesPreview = (line) => {
  const lineActions = normalizeLineActions(line.actions || {});
  const choicesData = lineActions?.choice;
  if (!choicesData?.items?.length) {
    return {
      hasChoices: false,
    };
  }

  return {
    hasChoices: true,
  };
};

const buildDialogueSpeakerPreview = (line, characterLookups) => {
  const lineActions = normalizeLineActions(line.actions || {});
  const characterId = lineActions?.dialogue?.characterId;
  if (!characterId) {
    return undefined;
  }

  return characterLookups.flatCharacterById.get(characterId)?.fileId;
};

const resolveDialogueModeLabel = (repositoryState, line) => {
  const lineActions = normalizeLineActions(line.actions || {});
  const dialogue = lineActions?.dialogue;
  if (!dialogue) {
    return undefined;
  }

  if (dialogue.mode === "nvl") {
    return "NVL";
  }

  if (dialogue.mode === "adv") {
    return "ADV";
  }

  const layoutId = dialogue.ui?.resourceId ?? dialogue.gui?.resourceId;
  const layoutType = repositoryState?.layouts?.items?.[layoutId]?.layoutType;
  if (layoutType === "nvl") {
    return "NVL";
  }

  return "ADV";
};

const toStableDomRefSuffix = (value = "") => {
  return Array.from(String(value)).reduce((result, char) => {
    if (/^[a-zA-Z0-9]$/.test(char)) {
      return `${result}${char}`;
    }

    return `${result}Z${char.codePointAt(0).toString(16)}`;
  }, "");
};

export const buildSceneEditorLineViewModels = ({
  lines,
  repositoryState,
  sectionLineChanges,
}) => {
  const characterLookups = buildCharacterLookups(repositoryState);

  return (lines || []).map((line, index) => {
    const lineActions = normalizeLineActions(line.actions || {});
    const changes = getLineChanges(sectionLineChanges, line.id);
    const choicesPreview = buildChoicesPreview(line);

    return {
      ...line,
      domRefSuffix: toStableDomRefSuffix(line.id),
      lineNumber: index + 1,
      background: buildBackgroundPreview(repositoryState, changes),
      bgm: changes.bgm
        ? {
            changeType: changes.bgm.changeType,
            resourceId: changes.bgm.data?.resourceId,
          }
        : undefined,
      characterFileId: buildDialogueSpeakerPreview(line, characterLookups),
      characterSprites: buildCharacterSpritePreview(
        repositoryState,
        changes,
        characterLookups.characterItems,
      ),
      visual: buildVisualPreview(repositoryState, changes),
      sectionTransition: buildSectionTransitionPreview(line),
      hasChoices: choicesPreview.hasChoices,
      hasSfx: !!changes.sfx,
      sfxChangeType: changes.sfx?.changeType,
      hasSetNextLineConfig:
        !!changes.setNextLineConfig || !!lineActions?.setNextLineConfig,
      setNextLineConfigChangeType: changes.setNextLineConfig?.changeType,
      hasDialogueLayout: !!changes.dialogue,
      dialogueModeLabel: resolveDialogueModeLabel(repositoryState, line),
      dialogueChangeType: changes.dialogue?.changeType,
      hasControl: !!changes.control,
      controlChangeType: changes.control?.changeType,
    };
  });
};
