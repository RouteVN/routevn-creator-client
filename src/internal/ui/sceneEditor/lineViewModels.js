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

const buildSceneLookups = (repositoryState) => {
  const flatScenes = toFlatItems(repositoryState?.scenes || []);
  const sceneNameById = new Map();
  const sectionNameById = new Map();

  for (const scene of flatScenes) {
    sceneNameById.set(scene.id, scene.name || "Unknown Scene");

    if (!scene.sections) {
      continue;
    }

    const flatSections = toFlatItems(scene.sections);
    for (const section of flatSections) {
      sectionNameById.set(section.id, section.name || "Unknown Section");
    }
  }

  return {
    sceneNameById,
    sectionNameById,
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

const buildSectionTransitionPreview = (line, sceneLookups) => {
  const lineActions = normalizeLineActions(line.actions || {});
  const transitionData = lineActions?.sectionTransition;
  if (!transitionData) {
    return {
      sectionTransition: false,
      transitionTarget: undefined,
    };
  }

  if (transitionData.sceneId) {
    return {
      sectionTransition: true,
      transitionTarget:
        sceneLookups.sceneNameById.get(transitionData.sceneId) ||
        "Unknown Scene",
    };
  }

  if (transitionData.sectionId) {
    return {
      sectionTransition: true,
      transitionTarget:
        sceneLookups.sectionNameById.get(transitionData.sectionId) ||
        "Unknown Section",
    };
  }

  return {
    sectionTransition: false,
    transitionTarget: undefined,
  };
};

const buildChoicesPreview = (line) => {
  const lineActions = normalizeLineActions(line.actions || {});
  const choicesData = lineActions?.choice;
  if (!choicesData?.items?.length) {
    return {
      hasChoices: false,
      choices: undefined,
    };
  }

  return {
    hasChoices: true,
    choices: choicesData.items,
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

export const buildSceneEditorLineViewModels = ({
  lines,
  repositoryState,
  sectionLineChanges,
}) => {
  const characterLookups = buildCharacterLookups(repositoryState);
  const sceneLookups = buildSceneLookups(repositoryState);

  return (lines || []).map((line, index) => {
    const lineActions = normalizeLineActions(line.actions || {});
    const changes = getLineChanges(sectionLineChanges, line.id);
    const transitionPreview = buildSectionTransitionPreview(line, sceneLookups);
    const choicesPreview = buildChoicesPreview(line);

    return {
      ...line,
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
      sectionTransition: transitionPreview.sectionTransition,
      transitionTarget: transitionPreview.transitionTarget,
      hasChoices: choicesPreview.hasChoices,
      choices: choicesPreview.choices,
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
