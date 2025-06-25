export const handleOnMount = (deps) => {
  const { store, props, render } = deps;
  // TODO: Fix prop passing - should receive step content from scene editor
  if (props?.stepContent) {
    store.setStepContent(props.stepContent);
  }
  render();
};

export const handleTextSelection = (e, deps) => {
  const { store, render } = deps;
  const selection = window.getSelection();
  
  if (selection.rangeCount > 0 && !selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    const selectedText = range.toString();
    
    // Get the text content of the container to calculate positions
    const container = e.currentTarget;
    const textContent = container.textContent;
    
    // Calculate start and end positions in the plain text
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(container);
    preCaretRange.setEnd(range.startContainer, range.startOffset);
    const start = preCaretRange.toString().length;
    const end = start + selectedText.length;
    
    store.setSelectedRange({
      start,
      end,
      text: selectedText
    });
  } else {
    store.clearSelection();
  }
  
  render();
};

export const handleFormatButtonClick = (e, deps) => {
  const { store, render } = deps;
  const formatType = e.currentTarget.id.replace('format-button-', '');
  const selectedRange = store.selectSelectedRange();
  
  if (selectedRange) {
    store.addFormatting({
      start: selectedRange.start,
      end: selectedRange.end,
      formatType
    });
    
    // Clear selection after formatting
    store.clearSelection();
    
    // Clear browser selection
    if (window.getSelection) {
      window.getSelection().removeAllRanges();
    }
  }
  
  render();
};

export const handleSubmitClick = (e, deps) => {
  const { dispatchEvent, store } = deps;
  const stepContent = store.selectStepContent();
  const formattedRanges = store.selectFormattedRanges();
  
  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        richText: {
          content: stepContent,
          formatting: formattedRanges
        }
      },
      bubbles: true,
      composed: true
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