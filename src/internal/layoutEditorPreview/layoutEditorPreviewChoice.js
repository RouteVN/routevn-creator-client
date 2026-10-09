export const createChoicePreviewItems = (choicesData = {}) => {
  const choiceItems = Array.isArray(choicesData.items) ? choicesData.items : [];

  return choiceItems.map((choice, index) => {
    return {
      content: choice?.content ?? `Choice ${index + 1}`,
      events: {
        click: {
          actions: {},
        },
      },
    };
  });
};

export const createChoiceFormDefaultValues = (choiceDefaultValues = {}) => {
  const choicesNum = Number(choiceDefaultValues.choicesNum);
  const choiceCount =
    Number.isFinite(choicesNum) && choicesNum > 0 ? choicesNum : 0;
  const defaultValues = {
    choicesNum: choiceCount,
  };

  for (let index = 0; index < choiceCount; index += 1) {
    defaultValues[`choice${index}`] =
      choiceDefaultValues.choices?.[index] ?? `Choice ${index + 1}`;
  }

  return defaultValues;
};
