export const INITIAL_STATE = Object.freeze({
  speakerName: '',
  dialogueText: ''
});

export const setSpeakerName = (state, name) => {
  state.speakerName = name;
};

export const setDialogueText = (state, text) => {
  state.dialogueText = text;
};

export const toViewData = ({ state, props }, payload) => {
  return {
    speakerName: state.speakerName,
    dialogueText: state.dialogueText,
  };
};