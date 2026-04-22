export const DEFAULT_DIALOGUE_CHARACTER_NAME = "Character";
export const DEFAULT_DIALOGUE_CONTENT = "This is a sample dialogue content.";
export const DEFAULT_DIALOGUE_REVEALING_SPEED = 50;

export const createDialogueLines = ({
  characterId,
  characterName,
  dialogueContent,
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
        name: "Narrator",
      },
      characterName: "Narrator",
      content: [{ text: dialogueContent }],
    },
  ];
};

export const createNvlLines = (nvlDefaultValues = {}) => {
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
      content: [{ text: sourceLines[index] ?? `Line ${index + 1}` }],
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

export const createNvlFormDefaultValues = (nvlDefaultValues = {}) => {
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
      `This is sample NVL line ${index + 1}.`;
  }

  return defaultValues;
};

export const createDialoguePreviewData = ({
  layoutType,
  dialogueDefaultValues,
  nvlDefaultValues,
  previewRevealingSpeed,
} = {}) => {
  const isNvlLayout = layoutType === "dialogue-nvl" || layoutType === "nvl";
  const characterId = dialogueDefaultValues?.["dialogue-character-id"] ?? "";
  const characterName =
    dialogueDefaultValues?.["dialogue-character-name"] ??
    DEFAULT_DIALOGUE_CHARACTER_NAME;
  const dialogueContent =
    dialogueDefaultValues?.["dialogue-content"] ?? DEFAULT_DIALOGUE_CONTENT;
  const parsedPreviewRevealingSpeed = Number(previewRevealingSpeed);
  const dialogueRevealingSpeed =
    Number.isFinite(parsedPreviewRevealingSpeed) &&
    parsedPreviewRevealingSpeed > 0
      ? parsedPreviewRevealingSpeed
      : DEFAULT_DIALOGUE_REVEALING_SPEED;
  const dialogueLines = isNvlLayout
    ? createNvlLines(nvlDefaultValues)
    : createDialogueLines({
        characterId,
        characterName,
        dialogueContent,
      });

  return {
    characterName,
    dialogueContent,
    dialogueRevealingSpeed,
    dialogue: {
      characterId,
      character: {
        name: characterName,
      },
      content: [{ text: dialogueContent }],
      lines: dialogueLines,
    },
    dialogueLines,
  };
};
