export const handleTextInput = (e, deps) => {
  const { store, render } = deps;
  const content = e.target.value;
  
  store.setTextContent(content);
  render();
};

export const handleFormatButtonClick = (e, deps) => {
  const { store, render } = deps;
  const formatType = e.currentTarget.id.replace('format-button-', '');
  
  store.toggleFormatting(formatType);
  render();
};

export const handleSubmitClick = (e, deps) => {
  const { store, render } = deps;
  
  // Placeholder for submitting rich text content
  // This would dispatch an event with the formatted text content
  
  render();
};