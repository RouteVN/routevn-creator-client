// The sample text the layout editor's Preview fills in, in the app's
// language, for its Preview panel and its canvas.
export const selectLayoutPreviewSampleText = (i18n) => {
  const copy = i18n.layoutEditorPage;
  return {
    characterName: copy.previewSampleCharacterName,
    narratorName: copy.previewSampleNarratorName,
    dialogueContent: copy.previewSampleDialogueContent,
    nvlLines: [
      copy.previewSampleNvlLine1,
      copy.previewSampleNvlLine2,
      copy.previewSampleNvlLine3,
    ],
    nvlLine: copy.previewSampleNvlLine,
    // Sample choices are numbered as the Layout Editor numbers choice items.
    choice: i18n.layoutEditPanel.choiceItemLabel,
    historyLines: [
      copy.previewSampleHistoryLine1,
      copy.previewSampleHistoryLine2,
      copy.previewSampleHistoryLine3,
    ],
    historyLine: copy.previewSampleHistoryLine,
  };
};
