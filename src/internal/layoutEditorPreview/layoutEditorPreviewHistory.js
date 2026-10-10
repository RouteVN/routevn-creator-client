export const createHistoryLines = (historyDefaultValues = {}) => {
  const linesNum = Number(historyDefaultValues.linesNum);
  const lineCount = Number.isFinite(linesNum) && linesNum > 0 ? linesNum : 0;
  const sourceCharacterNames = Array.isArray(
    historyDefaultValues.characterNames,
  )
    ? historyDefaultValues.characterNames
    : [];
  const sourceTexts = Array.isArray(historyDefaultValues.texts)
    ? historyDefaultValues.texts
    : [];

  return Array.from({ length: lineCount }, (_unused, index) => ({
    characterName: sourceCharacterNames[index] ?? "",
    text: sourceTexts[index] ?? `History line ${index + 1}`,
  }));
};

export const createHistoryFormDefaultValues = (historyDefaultValues = {}) => {
  const linesNum = Number(historyDefaultValues.linesNum);
  const lineCount = Number.isFinite(linesNum) && linesNum > 0 ? linesNum : 0;
  const defaultValues = {
    linesNum: lineCount,
  };

  for (let index = 0; index < lineCount; index += 1) {
    defaultValues[`characterName${index}`] =
      historyDefaultValues.characterNames?.[index] ?? "";
    defaultValues[`text${index}`] =
      historyDefaultValues.texts?.[index] ?? `History line ${index + 1}`;
  }

  return defaultValues;
};
