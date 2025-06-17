export const handleSpeakerInput = (e, deps) => {
  const { store, render } = deps;
  const name = e.target.value;
  
  store.setSpeakerName(name);
  render();
};

export const handleDialogueInput = (e, deps) => {
  const { store, render } = deps;
  const text = e.target.value;
  
  store.setDialogueText(text);
  render();
};

export const handleSubmitClick = (e, deps) => {
  const { store, render } = deps;
  
  // Placeholder for submitting dialogue configuration
  
  render();
};