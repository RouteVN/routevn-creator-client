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
  const { dispatchEvent } = deps;
  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        richText: {
          textContent: e?.textContent,
        }
      },
    }),
  );
};

export const handleBreadcumbActionsClick = (payload, deps) => {
  const { dispatchEvent } = deps;

  dispatchEvent(
    new CustomEvent("back-to-actions", {
      detail: {},
    }),
  );
};