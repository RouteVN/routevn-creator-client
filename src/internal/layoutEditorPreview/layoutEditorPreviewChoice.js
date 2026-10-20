import {
  DEFAULT_PREVIEW_SAMPLE_TEXT,
  formatSampleLine,
} from "./layoutEditorPreviewSampleText.js";

export const createChoicePreviewItems = (
  choicesData = {},
  sampleText = DEFAULT_PREVIEW_SAMPLE_TEXT,
) => {
  const choiceItems = Array.isArray(choicesData.items) ? choicesData.items : [];

  return choiceItems.map((choice, index) => {
    return {
      content: choice?.content ?? formatSampleLine(sampleText.choice, index),
      events: {
        click: {
          actions: {},
        },
      },
    };
  });
};

export const createChoiceFormDefaultValues = (
  choiceDefaultValues = {},
  sampleText = DEFAULT_PREVIEW_SAMPLE_TEXT,
) => {
  const choicesNum = Number(choiceDefaultValues.choicesNum);
  const choiceCount =
    Number.isFinite(choicesNum) && choicesNum > 0 ? choicesNum : 0;
  const defaultValues = {
    choicesNum: choiceCount,
  };

  for (let index = 0; index < choiceCount; index += 1) {
    defaultValues[`choice${index}`] =
      choiceDefaultValues.choices?.[index] ??
      formatSampleLine(sampleText.choice, index);
  }

  return defaultValues;
};
