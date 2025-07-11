

// Helper function to find the position on the last line closest to goal column
const findLastLinePosition = (element, goalColumn) => {
  const text = element.textContent;
  const textLength = text.length;


  // If no text or goal column is at end, return end position
  if (textLength === 0 || goalColumn >= textLength) {
    return textLength;
  }

  // Create a range to test each position and find where the last line starts
  let lastLineStartPos = 0;
  let lastLineTop = null;

  // Walk backwards from the end to find where the last line starts
  for (let pos = textLength; pos >= 0; pos--) {
    try {
      const range = document.createRange();

      // Position the range at this character position
      let currentPos = 0;
      let foundNode = false;

      const walkTextNodes = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const nodeLength = node.textContent.length;
          if (currentPos + nodeLength >= pos) {
            const offset = pos - currentPos;
            range.setStart(node, offset);
            range.setEnd(node, offset);
            foundNode = true;
            return true;
          }
          currentPos += nodeLength;
        } else {
          for (let child of node.childNodes) {
            if (walkTextNodes(child)) return true;
          }
        }
        return false;
      };

      walkTextNodes(element);

      if (foundNode) {
        const rect = range.getBoundingClientRect();

        if (lastLineTop === null) {
          // First position (end of text) - this is definitely the last line
          lastLineTop = rect.top;
          lastLineStartPos = pos;
        } else if (Math.abs(rect.top - lastLineTop) > 5) {
          // We've moved to a different line (more than 5px difference)
          // The previous position was the start of the last line
          break;
        } else {
          // Still on the same line
          lastLineStartPos = pos;
        }
      }
    } catch (e) {
      // If range creation fails, continue
      continue;
    }
  }

  // Now find the position on the last line closest to the goal column
  const lastLineLength = textLength - lastLineStartPos;
  const positionOnLastLine = Math.min(goalColumn, lastLineLength);
  const finalPosition = lastLineStartPos + positionOnLastLine;

  return finalPosition;
};

// Helper function to get cursor position in contenteditable
const getCursorPosition = (element) => {
  if (!element) {
    return 0;
  }

  // For Shadow DOM, we need to get the selection from the shadow root
  let selection = window.getSelection();
  let shadowRoot = element.getRootNode();

  // Check if we're in a shadow DOM
  if (shadowRoot && shadowRoot.getSelection) {
    selection = shadowRoot.getSelection();
  }

  if (!selection || selection.rangeCount === 0) return 0;

  const range = selection.getRangeAt(0);

  // Check if the selection is actually within our element
  if (!element.contains(range.startContainer)) {
    return 0;
  }

  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(element);
  preCaretRange.setEnd(range.endContainer, range.endOffset);
  const position = preCaretRange.toString().length;
  return position;
};

// Helper function to check if cursor is on the first line of contenteditable
const isCursorOnFirstLine = (element) => {
  // Get shadow root for selection if needed
  let selection = window.getSelection();
  let shadowRoot = element.getRootNode();

  // Check if we're in a shadow DOM
  if (shadowRoot && shadowRoot.getSelection) {
    selection = shadowRoot.getSelection();
  }

  if (!selection || selection.rangeCount === 0) return false;

  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer)) return false;

  // Get the bounding rectangle of the cursor position
  const cursorRect = range.getBoundingClientRect();

  // Create a range at the very beginning of the element
  const startRange = document.createRange();

  // Instead of using selectNodeContents and collapse, let's position at the actual start
  let firstTextNode = null;

  // Walk through all text nodes to find the actual first position
  const walkTextNodes = (node) => {
    if (node.nodeType === Node.TEXT_NODE && !firstTextNode) {
      firstTextNode = node;
      return true; // Stop walking once we find the first text node
    } else {
      for (let child of node.childNodes) {
        if (walkTextNodes(child)) return true;
      }
    }
    return false;
  };

  walkTextNodes(element);

  // If we found a text node, position the range there
  if (firstTextNode) {
    startRange.setStart(firstTextNode, 0);
    startRange.setEnd(firstTextNode, 0);
  } else {
    // Fallback to element positioning if no text nodes found
    startRange.selectNodeContents(element);
    startRange.collapse(true);
  }

  const startRect = startRange.getBoundingClientRect();

  // Consider the cursor on the first line if it's within a reasonable tolerance of the first line
  const tolerance = 5; // pixels
  const isOnFirstLine = Math.abs(cursorRect.top - startRect.top) <= tolerance;

  return isOnFirstLine;
};

// Helper function to check if cursor is on the last line of contenteditable
const isCursorOnLastLine = (element) => {
  // Get shadow root for selection if needed
  let selection = window.getSelection();
  let shadowRoot = element.getRootNode();

  // Check if we're in a shadow DOM
  if (shadowRoot && shadowRoot.getSelection) {
    selection = shadowRoot.getSelection();
  }

  if (!selection || selection.rangeCount === 0) return false;

  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer)) return false;

  // Get the bounding rectangle of the cursor position
  const cursorRect = range.getBoundingClientRect();

  // Create a range at the very end of the element
  const endRange = document.createRange();

  // Instead of using selectNodeContents and collapse, let's position at the actual end
  let lastTextNode = null;
  let lastOffset = 0;

  // Walk through all text nodes to find the actual last position
  const walkTextNodes = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      lastTextNode = node;
      lastOffset = node.textContent.length;
    } else {
      for (let child of node.childNodes) {
        walkTextNodes(child);
      }
    }
  };

  walkTextNodes(element);

  // If we found a text node, position the range there
  if (lastTextNode) {
    endRange.setStart(lastTextNode, lastOffset);
    endRange.setEnd(lastTextNode, lastOffset);
  } else {
    // Fallback to element positioning if no text nodes found
    endRange.selectNodeContents(element);
    endRange.collapse(false);
  }

  const endRect = endRange.getBoundingClientRect();

  // Consider the cursor on the last line if it's within a reasonable tolerance of the last line
  const tolerance = 5; // pixels
  const isOnLastLine = Math.abs(cursorRect.top - endRect.top) <= tolerance;

  return isOnLastLine;
};

export const handleOnMount = (deps) => {
  const { store, getRefIds, repository } = deps;

  store.setRepositoryState(repository.getState());

  // Focus container on mount to enable keyboard navigation
  setTimeout(() => {
    const container = getRefIds()['container']?.elm;
    if (container) {
      container.focus();
    }
  }, 0);
};

export const handleContainerKeyDown = (e, deps) => {
  const { store, render, props, dispatchEvent } = deps;
  const mode = store.selectMode();

  // Only handle container keydown if the target is the container itself
  // If it's a contenteditable, let the line handler handle it
  if (e.target.id !== 'container') {
    return;
  }

  if (mode === 'block') {
    const currentLineId = props.selectedLineId;
    const lines = props.lines || [];

    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        e.stopPropagation();
        if (!currentLineId && lines.length > 0) {
          // No selection, select the first line
          dispatchEvent(new CustomEvent("lineSelectionChanged", {
            detail: { lineId: lines[0].id }
          }));
        } else if (currentLineId) {
          const currentIndex = lines.findIndex(line => line.id === currentLineId);
          if (currentIndex > 0) {
            const prevLineId = lines[currentIndex - 1].id;
            dispatchEvent(new CustomEvent("lineSelectionChanged", {
              detail: { lineId: prevLineId }
            }));
          }
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        e.stopPropagation();
        if (!currentLineId && lines.length > 0) {
          // No selection, select the first line
          dispatchEvent(new CustomEvent("lineSelectionChanged", {
            detail: { lineId: lines[0].id }
          }));
        } else if (currentLineId) {
          const currentIndex = lines.findIndex(line => line.id === currentLineId);
          if (currentIndex < lines.length - 1) {
            const nextLineId = lines[currentIndex + 1].id;
            dispatchEvent(new CustomEvent("lineSelectionChanged", {
              detail: { lineId: nextLineId }
            }));
          }
        }
        break;
      case "Enter":
        e.preventDefault();
        if (currentLineId) {
          // Focus the selected line to enter text-editor mode at the end
          const lineElement = deps.getRefIds()[`line-${currentLineId}`]?.elm;
          if (lineElement) {
            // Position cursor at the end before focusing
            const textLength = lineElement.textContent.length;
            store.setCursorPosition(textLength);
            store.setGoalColumn(textLength);
            store.setNavigationDirection('end');

            // Use updateSelectedLine to properly position cursor at end
            deps.handlers.updateSelectedLine(currentLineId, deps);
          }
        }
        break;
    }
  }
};

export const handleLineKeyDown = (e, deps) => {
  const { editor, dispatchEvent, store, render, props } = deps;
  const id = e.target.id.replace(/^line-/, "");
  let newOffset;
  const mode = store.selectMode();

  // Capture cursor position immediately before any key handling
  if (mode === 'text-editor') {
    const cursorPos = getCursorPosition(e.currentTarget);
    store.setCursorPosition(cursorPos);

    // Update goal column for horizontal movement or when setting new vertical position
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
      store.setGoalColumn(cursorPos);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      // For vertical movement, ensure we have the current position as goal column if not set
      const currentGoalColumn = store.selectGoalColumn();
      if (currentGoalColumn === 0) {
        store.setGoalColumn(cursorPos);
      }
    }
  }

  switch (e.key) {
    case "Backspace":
      if (mode === 'text-editor') {
        // Check if cursor is at position 0
        const currentPos = getCursorPosition(e.currentTarget);

        if (currentPos === 0) {
          e.preventDefault();
          e.stopPropagation();

          // Get current line content
          const currentContent = e.currentTarget.textContent;
          const currentLineId = e.currentTarget.id.replace(/^line-/, "");

          // Find the previous line
          const currentIndex = props.lines.findIndex(line => line.id === currentLineId);

          if (currentIndex > 0) {
            const prevLine = props.lines[currentIndex - 1];

            // Dispatch event to merge lines
            dispatchEvent(
              new CustomEvent("mergeLines", {
                detail: {
                  prevLineId: prevLine.id,
                  currentLineId: currentLineId,
                  contentToAppend: currentContent,
                },
              })
            );
          }
        }
      }
      break;
    case "Escape":
      e.preventDefault();
      // Switch to block mode and blur the current element
      store.setMode('block');
      e.currentTarget.blur();
      // Focus the container to enable block mode navigation
      const container = deps.getRefIds()['container']?.elm;
      if (container) {
        container.focus();
      }
      render();
      break;
    case "Enter":
      if (mode === 'text-editor') {
        e.preventDefault();

        // Get current cursor position and text content
        const cursorPos = getCursorPosition(e.currentTarget);
        const fullText = e.currentTarget.textContent;

        // Split the content at cursor position
        const leftContent = fullText.substring(0, cursorPos);
        const rightContent = fullText.substring(cursorPos);

        requestAnimationFrame(() => {
          dispatchEvent(
            new CustomEvent("splitLine", {
              detail: {
                lineId: id,
                leftContent: leftContent,
                rightContent: rightContent,
              },
            })
          );
        });
      }
      break;
    case "ArrowUp":
      if (mode === 'block') {
        e.preventDefault();
        // In block mode, just update selectedLineId without focusing
        const currentIndex = props.lines.findIndex(line => line.id === id);
        if (currentIndex > 0) {
          const prevLine = props.lines[currentIndex - 1];
          dispatchEvent(new CustomEvent("lineSelectionChanged", {
            detail: { lineId: prevLine.id }
          }));
        }
      } else {
        // In text-editor mode, check if cursor is on first line
        const isOnFirstLine = isCursorOnFirstLine(e.currentTarget);

        if (isOnFirstLine) {
          // Cursor is on first line, move to previous line
          e.preventDefault();
          e.stopPropagation(); // Prevent bubbling to container
          const goalColumn = store.selectGoalColumn() || 0;

          // Set navigating flag
          store.setIsNavigating(true);

          dispatchEvent(
            new CustomEvent("moveUp", {
              detail: {
                lineId: e.currentTarget.id.replace(/^line-/, ""),
                cursorPosition: goalColumn,
              },
            })
          );
        }
        // If not on first line, let native behavior handle it (don't preventDefault)
      }
      break;
    case "ArrowDown":
      if (mode === 'block') {
        e.preventDefault();
        // In block mode, just update selectedLineId without focusing
        const currentIndex = props.lines.findIndex(line => line.id === id);
        if (currentIndex < props.lines.length - 1) {
          const nextLine = props.lines[currentIndex + 1];
          dispatchEvent(new CustomEvent("lineSelectionChanged", {
            detail: { lineId: nextLine.id }
          }));
        }
      } else {
        // In text-editor mode, check if cursor is on last line
        const isOnLastLine = isCursorOnLastLine(e.currentTarget);

        if (isOnLastLine) {
          // Cursor is on last line, move to next line
          e.preventDefault();
          e.stopPropagation(); // Prevent bubbling to container
          const goalColumn = store.selectGoalColumn() || 0;

          // Set navigating flag
          store.setIsNavigating(true);

          dispatchEvent(
            new CustomEvent("moveDown", {
              detail: {
                lineId: e.currentTarget.id.replace(/^line-/, ""),
                cursorPosition: goalColumn,
              },
            })
          );
        }
        // If not on last line, let native behavior handle it (don't preventDefault)
      }
      break;
    case "ArrowRight":
      if (mode === 'text-editor') {
        // Check if cursor is at the end of the text
        const currentPos = getCursorPosition(e.currentTarget);
        const textLength = e.currentTarget.textContent.length;

        if (currentPos >= textLength) {
          // Cursor is at end, move to next line
          e.preventDefault();
          e.stopPropagation();

          // Set navigating flag
          store.setIsNavigating(true);

          dispatchEvent(
            new CustomEvent("moveDown", {
              detail: {
                lineId: e.currentTarget.id.replace(/^line-/, ""),
                cursorPosition: 0, // Go to beginning of next line
              },
            })
          );
        }
        // If not at end, let native behavior handle it
      }
      break;
    case "ArrowLeft":
      if (mode === 'text-editor') {
        // Check if cursor is at the beginning of the text
        const currentPos = getCursorPosition(e.currentTarget);

        if (currentPos <= 0) {
          // Cursor is at beginning, move to previous line
          e.preventDefault();
          e.stopPropagation();

          // Set navigating flag
          store.setIsNavigating(true);

          dispatchEvent(
            new CustomEvent("moveUp", {
              detail: {
                lineId: e.currentTarget.id.replace(/^line-/, ""),
                cursorPosition: -1, // Special value to indicate "go to end"
              },
            })
          );
        }
      }
      break;

  }

};

export const handleLineMouseUp = (e, deps) => {
  const { store } = deps;

  // Save cursor position after mouse up (selection change)
  // Use multiple attempts with slight delays to ensure selection is established
  setTimeout(() => {
    const cursorPos = getCursorPosition(e.currentTarget);
    if (cursorPos > 0) {
      store.setCursorPosition(cursorPos);
      store.setGoalColumn(cursorPos);
    } else {
      // Try again with longer delay if position is 0
      setTimeout(() => {
        const cursorPos2 = getCursorPosition(e.currentTarget);
        store.setCursorPosition(cursorPos2);
        store.setGoalColumn(cursorPos2);
      }, 10);
    }
  }, 0);
};

export const handleOnInput = (e, deps) => {
  const { dispatchEvent, store } = deps;

  const lineId = e.target.id.replace(/^line-/, "");
  const content = e.target.textContent;

  // Save cursor position on every input
  const cursorPos = getCursorPosition(e.target);
  store.setCursorPosition(cursorPos);

  const detail = {
    lineId,
    content,
  }

  dispatchEvent(
    new CustomEvent("editor-data-changed", {
      detail,
    })
  );
};


export const updateSelectedLine = (lineId, deps) => {
  const { store, getRefIds } = deps;
  const refIds = getRefIds();
  const lineRef = refIds[`line-${lineId}`];

  // Get goal column (desired position) instead of current position
  const goalColumn = store.selectGoalColumn() || 0;
  const textLength = lineRef.elm.textContent.length;
  const direction = store.selectNavigationDirection();

  // Choose positioning strategy based on direction
  let targetPosition;
  if (direction === 'up') {
    // For upward navigation, find position on last line
    targetPosition = findLastLinePosition(lineRef.elm, goalColumn);
  } else if (direction === 'end') {
    // For end positioning (ArrowLeft navigation), position at absolute end
    targetPosition = textLength;
  } else {
    // For downward navigation, use normal goal column positioning
    targetPosition = Math.min(goalColumn, textLength);
  }

  // Get shadow root for selection if needed
  let shadowRoot = lineRef.elm.getRootNode();
  let selection = window.getSelection();

  // Check if we're in a shadow DOM
  if (shadowRoot && shadowRoot.getSelection) {
    selection = shadowRoot.getSelection();
  }

  // Create a range at the desired position before focusing
  const range = document.createRange();

  // Try to set position before focus
  let currentPos = 0;
  let foundNode = false;
  let lastTextNode = null;
  let lastTextNodeLength = 0;
  let actualPosition = 0;

  const walkTextNodes = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const nodeLength = node.textContent.length;
      lastTextNode = node;
      lastTextNodeLength = nodeLength;

      if (currentPos + nodeLength >= targetPosition) {
        const offset = targetPosition - currentPos;
        range.setStart(node, offset);
        range.setEnd(node, offset);
        actualPosition = targetPosition;
        foundNode = true;
        return true;
      }
      currentPos += nodeLength;
    } else {
      for (let child of node.childNodes) {
        if (walkTextNodes(child)) return true;
      }
    }
    return false;
  };

  walkTextNodes(lineRef.elm);

  // If we didn't find a position (cursor beyond text), position at end
  if (!foundNode && lastTextNode) {
    range.setStart(lastTextNode, lastTextNodeLength);
    range.setEnd(lastTextNode, lastTextNodeLength);
    actualPosition = textLength;
    foundNode = true;
  }

  if (foundNode && selection) {
    selection.removeAllRanges();
    selection.addRange(range);

    // Update the current cursor position in store to reflect where we actually landed
    store.setCursorPosition(actualPosition);
  }

  // Now focus - the selection should be preserved
  lineRef.elm.focus({ preventScroll: true });
};

export const handleOnFocus = (e, deps) => {
  const { store, render, dispatchEvent } = deps;
  const lineId = e.currentTarget.id.replace(/^line-/, "");

  // Always update the selected line ID
  dispatchEvent(new CustomEvent("lineSelectionChanged", {
    detail: { lineId }
  }));
  store.setMode('text-editor'); // Switch to text-editor mode on focus

  // Check if we're navigating - if so, don't reset cursor or re-render
  if (store.selectIsNavigating()) {
    // Reset the flag but don't render
    store.setIsNavigating(false);
    return;
  }

  // When user clicks to focus (not navigating), set goal column to current position
  setTimeout(() => {
    const cursorPos = getCursorPosition(e.currentTarget);
    if (cursorPos >= 0) {
      store.setGoalColumn(cursorPos);
    }
  }, 10);

  render();
};

