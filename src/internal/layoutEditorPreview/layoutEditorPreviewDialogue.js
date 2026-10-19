import {
  DEFAULT_PREVIEW_SAMPLE_TEXT,
  formatSampleLine,
} from "./layoutEditorPreviewSampleText.js";

export const DEFAULT_DIALOGUE_REVEALING_SPEED = 50;

export const createDialogueLines = ({
  characterId,
  characterName,
  dialogueContent,
  narratorName,
}) => {
  return [
    {
      characterId,
      character: {
        name: characterName,
      },
      characterName,
      content: [{ text: dialogueContent }],
    },
    {
      content: [{ text: dialogueContent }],
    },
    {
      character: {
        name: narratorName,
      },
      characterName: narratorName,
      content: [{ text: dialogueContent }],
    },
  ];
};

export const createNvlLines = (
  nvlDefaultValues = {},
  sampleText = DEFAULT_PREVIEW_SAMPLE_TEXT,
) => {
  const linesNum = Number(nvlDefaultValues.linesNum);
  const lineCount = Number.isFinite(linesNum) && linesNum > 0 ? linesNum : 0;
  const sourceCharacterNames = Array.isArray(nvlDefaultValues.characterNames)
    ? nvlDefaultValues.characterNames
    : [];
  const sourceLines = Array.isArray(nvlDefaultValues.lines)
    ? nvlDefaultValues.lines
    : [];

  return Array.from({ length: lineCount }, (_unused, index) => {
    const characterName = sourceCharacterNames[index] ?? "";
    const line = {
      content: [
        {
          text:
            sourceLines[index] ?? formatSampleLine(sampleText.nvlLine, index),
        },
      ],
    };

    if (characterName) {
      line.character = {
        name: characterName,
      };
      line.characterName = characterName;
    }

    return line;
  });
};

export const createNvlFormDefaultValues = (
  nvlDefaultValues = {},
  sampleText = DEFAULT_PREVIEW_SAMPLE_TEXT,
) => {
  const linesNum = Number(nvlDefaultValues.linesNum);
  const lineCount = Number.isFinite(linesNum) && linesNum > 0 ? linesNum : 0;
  const defaultValues = {
    linesNum: lineCount,
  };

  for (let index = 0; index < lineCount; index += 1) {
    defaultValues[`characterName${index}`] =
      nvlDefaultValues.characterNames?.[index] ?? "";
    defaultValues[`line${index}`] =
      nvlDefaultValues.lines?.[index] ??
      formatSampleLine(sampleText.nvlLine, index);
  }

  return defaultValues;
};

export const createDialoguePreviewData = ({
  layoutType,
  dialogueDefaultValues,
  nvlDefaultValues,
  previewRevealingSpeed,
  sampleText = DEFAULT_PREVIEW_SAMPLE_TEXT,
} = {}) => {
  const isNvlLayout = layoutType === "dialogue-nvl" || layoutType === "nvl";
  const characterId = dialogueDefaultValues?.["dialogue-character-id"] ?? "";
  const characterName =
    dialogueDefaultValues?.["dialogue-character-name"] ??
    sampleText.characterName;
  const dialogueContent =
    dialogueDefaultValues?.["dialogue-content"] ?? sampleText.dialogueContent;
  const characterSpriteId =
    dialogueDefaultValues?.["dialogue-character-sprite-id"];
  const characterSpriteTransformId =
    dialogueDefaultValues?.["dialogue-character-sprite-transform-id"];
  const character = { name: characterName };
  if (characterSpriteId || characterSpriteTransformId) {
    character.sprite = {
      items: [],
    };
    // The preview data is saved with the layout and cannot hold an undefined
    // field, so an avatar without a transform has no `transformId`.
    if (characterSpriteTransformId !== undefined) {
      character.sprite.transformId = characterSpriteTransformId;
    }
    if (characterSpriteId) {
      character.sprite.items.push({
        id: "base",
        resourceId: characterSpriteId,
      });
    }
  }
  const parsedPreviewRevealingSpeed = Number(previewRevealingSpeed);
  const dialogueRevealingSpeed =
    Number.isFinite(parsedPreviewRevealingSpeed) &&
    parsedPreviewRevealingSpeed > 0
      ? parsedPreviewRevealingSpeed
      : DEFAULT_DIALOGUE_REVEALING_SPEED;
  const dialogueLines = isNvlLayout
    ? createNvlLines(nvlDefaultValues, sampleText)
    : createDialogueLines({
        characterId,
        characterName,
        dialogueContent,
        narratorName: sampleText.narratorName,
      });

  return {
    characterName,
    dialogueContent,
    dialogueRevealingSpeed,
    dialogue: {
      characterId,
      character,
      content: [{ text: dialogueContent }],
      lines: dialogueLines,
    },
    dialogueLines,
  };
};
