import { toFlatItems } from "../../project/tree.js";
import { buildCharacterSpritePreviewFileIds } from "../../characterSpritePreview.js";
import { normalizeLineActions } from "../../project/engineActions.js";

const getSectionLineEntry = (sectionLineChanges, lineId) => {
  const changesLines = sectionLineChanges?.lines || [];
  return changesLines.find((change) => change.id === lineId);
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

const resolvePreviewResourceFileId = ({ repositoryState, resourceId }) => {
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

const buildCharacterSpritePreview = (changes, characterItems) => {
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
        const spriteFileIds = buildCharacterSpritePreviewFileIds({
          spritesCollection: character?.sprites,
          spriteIds: Array.isArray(characterChange.sprites)
            ? characterChange.sprites.map((sprite) => sprite?.resourceId)
            : [],
        });

        if (spriteFileIds.length === 0) {
          return undefined;
        }

        return {
          characterId: characterChange.id,
          characterName: character?.name || "Unknown",
          fileId: spriteFileIds[0],
          spriteFileIds,
        };
      })
      .filter(Boolean),
  };
};

const resolveVisualPreviewFileId = ({ repositoryState, resourceId }) => {
  return resolvePreviewResourceFileId({ repositoryState, resourceId });
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

const buildConditionalPreview = (lineActions) => {
  return !!lineActions?.conditional;
};

const buildUpdateVariablePreview = (lineActions) => {
  return !!lineActions?.updateVariable;
};

const buildDialogueSpeakerPreview = (characterId, characterLookups) => {
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
  if (layoutType === "dialogue-nvl") {
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

const buildSceneDocumentLineViewModels = ({
  lines,
  repositoryState,
  sectionLineChanges,
}) => {
  const characterLookups = buildCharacterLookups(repositoryState);

  const viewModels = (lines || []).map((line, index) => {
    const lineActions = normalizeLineActions(line.actions || {});
    const sectionLineEntry = getSectionLineEntry(sectionLineChanges, line.id);
    const changes = sectionLineEntry?.changes || {};
    const choicesPreview = buildChoicesPreview(line);
    const linePresentationState = sectionLineEntry?.presentationState;

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
      characterFileId: buildDialogueSpeakerPreview(
        linePresentationState?.dialogue?.characterId,
        characterLookups,
      ),
      characterSprites: buildCharacterSpritePreview(
        changes,
        characterLookups.characterItems,
      ),
      visual: buildVisualPreview(repositoryState, changes),
      sectionTransition: buildSectionTransitionPreview(line),
      hasChoices: choicesPreview.hasChoices,
      hasConditional: buildConditionalPreview(lineActions),
      hasUpdateVariable: buildUpdateVariablePreview(lineActions),
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

  return viewModels;
};

export const buildSceneDocumentLineDecorations = ({
  lines,
  repositoryState,
  sectionLineChanges,
}) => {
  return buildSceneDocumentLineViewModels({
    lines,
    repositoryState,
    sectionLineChanges,
  });
};
