
// Helper function to get cursor position in contenteditable
const getCursorPosition = (element) => {
  if (!element) {
    console.log('getCursorPosition - element is null');
    return 0;
  }
  
  // For Shadow DOM, we need to get the selection from the shadow root
  let selection = window.getSelection();
  let shadowRoot = element.getRootNode();
  
  // Check if we're in a shadow DOM
  if (shadowRoot && shadowRoot.getSelection) {
    selection = shadowRoot.getSelection();
    console.log('getCursorPosition - using shadowRoot selection');
  }
  
  console.log('getCursorPosition - selection:', selection, 'rangeCount:', selection.rangeCount);
  console.log('getCursorPosition - element:', element, 'activeElement:', document.activeElement);
  
  if (!selection || selection.rangeCount === 0) return 0;
  
  const range = selection.getRangeAt(0);
  console.log('getCursorPosition - range:', range, 'startContainer:', range.startContainer, 'startOffset:', range.startOffset);
  
  // Check if the selection is actually within our element
  if (!element.contains(range.startContainer)) {
    console.log('getCursorPosition - selection not in element, returning 0');
    return 0;
  }
  
  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(element);
  preCaretRange.setEnd(range.endContainer, range.endOffset);
  const position = preCaretRange.toString().length;
  console.log('getCursorPosition - calculated position:', position, 'text length:', element.textContent.length);
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
  
  console.log('isCursorOnFirstLine - element:', element.id, 'cursorTop:', cursorRect.top, 'startTop:', startRect.top, 'diff:', Math.abs(cursorRect.top - startRect.top), 'result:', isOnFirstLine, 'firstTextNode:', firstTextNode);
  
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
  
  console.log('isCursorOnLastLine - element:', element.id, 'cursorTop:', cursorRect.top, 'endTop:', endRect.top, 'diff:', Math.abs(cursorRect.top - endRect.top), 'result:', isOnLastLine, 'lastTextNode:', lastTextNode, 'lastOffset:', lastOffset);
  
  return isOnLastLine;
};


export const handleOnMount = (deps) => {
  const { store, getRefIds, props } = deps;
  
  // Focus container on mount to enable keyboard navigation
  setTimeout(() => {
    const container = getRefIds()['container']?.elm;
    console.log('OnMount - container element:', container);
    if (container) {
      container.focus();
      console.log('OnMount - container focused, activeElement:', document.activeElement);
    }
  }, 0);
};

export const handleContainerKeyDown = (e, deps) => {
  const { store, render, props } = deps;
  const mode = store.selectMode();
  
  console.log('Container keydown - key:', e.key, 'mode:', mode, 'activeElement:', document.activeElement);
  
  // Only handle container keydown if the target is the container itself
  // If it's a contenteditable, let the step handler handle it
  if (e.target.id !== 'container') {
    return;
  }
  
  if (mode === 'block') {
    const currentStepId = store.selectSelectedStepId();
    const steps = props.steps || [];
    
    console.log('Block mode - currentStepId:', currentStepId, 'steps length:', steps.length);
    
    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        e.stopPropagation();
        console.log('ArrowUp prevented');
        if (!currentStepId && steps.length > 0) {
          // No selection, select the first step
          store.setSelectedStepId(steps[0].id);
          render();
        } else if (currentStepId) {
          const currentIndex = steps.findIndex(step => step.id === currentStepId);
          if (currentIndex > 0) {
            const prevStepId = steps[currentIndex - 1].id;
            store.setSelectedStepId(prevStepId);
            render();
          }
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        e.stopPropagation();
        console.log('ArrowDown prevented');
        if (!currentStepId && steps.length > 0) {
          // No selection, select the first step
          store.setSelectedStepId(steps[0].id);
          render();
        } else if (currentStepId) {
          const currentIndex = steps.findIndex(step => step.id === currentStepId);
          if (currentIndex < steps.length - 1) {
            const nextStepId = steps[currentIndex + 1].id;
            store.setSelectedStepId(nextStepId);
            render();
          }
        }
        break;
      case "Enter":
        e.preventDefault();
        if (currentStepId) {
          // Focus the selected step to enter text-editor mode at the end
          const stepElement = deps.getRefIds()[`step-${currentStepId}`]?.elm;
          if (stepElement) {
            // Position cursor at the end before focusing
            const textLength = stepElement.textContent.length;
            store.setCursorPosition(textLength);
            store.setGoalColumn(textLength);
            store.setNavigationDirection('end');
            
            // Use updateSelectedStep to properly position cursor at end
            deps.handlers.updateSelectedStep(currentStepId, deps);
          }
        }
        break;
    }
  }
};

export const handleStepKeyDown = (e, deps) => {
  const { editor, dispatchEvent, store, render, props } = deps;
  const id = e.target.id.replace(/^step-/, "");
  console.log('id', id)
  let newOffset;
  const mode = store.selectMode();
  
  // Capture cursor position immediately before any key handling
  if (mode === 'text-editor') {
    const cursorPos = getCursorPosition(e.currentTarget);
    console.log('handleStepKeyDown - pre-capture cursor position:', cursorPos);
    store.setCursorPosition(cursorPos);
    
    // Update goal column for horizontal movement or when setting new vertical position
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
      store.setGoalColumn(cursorPos);
      console.log('handleStepKeyDown - updated goal column for horizontal movement:', cursorPos);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      // For vertical movement, ensure we have the current position as goal column if not set
      const currentGoalColumn = store.selectGoalColumn();
      if (currentGoalColumn === 0) {
        store.setGoalColumn(cursorPos);
        console.log('handleStepKeyDown - set goal column for vertical movement:', cursorPos);
      }
    }
  }
  
  switch (e.key) {
    case "Escape":
      e.preventDefault();
      console.log('ESC pressed - switching to block mode');
      // Switch to block mode and blur the current element
      store.setMode('block');
      e.currentTarget.blur();
      // Focus the container to enable block mode navigation
      const container = deps.getRefIds()['container']?.elm;
      console.log('ESC - container element:', container);
      if (container) {
        container.focus();
        console.log('ESC - container focused, activeElement:', document.activeElement);
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
        
        console.log('Enter pressed - splitting content:');
        console.log('  cursorPos:', cursorPos);
        console.log('  leftContent:', JSON.stringify(leftContent));
        console.log('  rightContent:', JSON.stringify(rightContent));
        
        requestAnimationFrame(() => {
          dispatchEvent(
            new CustomEvent("splitStep", {
              detail: {
                stepId: id,
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
        // In block mode, just update selectedStepId without focusing
        const currentIndex = props.steps.findIndex(step => step.id === id);
        if (currentIndex > 0) {
          const prevStep = props.steps[currentIndex - 1];
          store.setSelectedStepId(prevStep.id);
          render();
        }
      } else {
        // In text-editor mode, check if cursor is on first line
        const isOnFirstLine = isCursorOnFirstLine(e.currentTarget);
        console.log('ArrowUp in text-editor mode - isOnFirstLine:', isOnFirstLine);
        
        if (isOnFirstLine) {
          // Cursor is on first line, move to previous step
          e.preventDefault();
          e.stopPropagation(); // Prevent bubbling to container
          const goalColumn = store.selectGoalColumn() || 0;
          console.log('ArrowUp in text-editor mode - using goal column:', goalColumn);
          
          // Set navigating flag
          store.setIsNavigating(true);
          
          dispatchEvent(
            new CustomEvent("moveUp", {
              detail: {
                stepId: e.currentTarget.id.replace(/^step-/, ""),
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
        // In block mode, just update selectedStepId without focusing
        const currentIndex = props.steps.findIndex(step => step.id === id);
        if (currentIndex < props.steps.length - 1) {
          const nextStep = props.steps[currentIndex + 1];
          store.setSelectedStepId(nextStep.id);
          render();
        }
      } else {
        // In text-editor mode, check if cursor is on last line
        const isOnLastLine = isCursorOnLastLine(e.currentTarget);
        console.log('ArrowDown in text-editor mode - element:', e.currentTarget.id, 'isOnLastLine:', isOnLastLine);
        
        if (isOnLastLine) {
          // Cursor is on last line, move to next step
          e.preventDefault();
          e.stopPropagation(); // Prevent bubbling to container
          const goalColumn = store.selectGoalColumn() || 0;
          console.log('ArrowDown in text-editor mode - moving to next step, using goal column:', goalColumn);
          
          // Set navigating flag
          store.setIsNavigating(true);
          
          dispatchEvent(
            new CustomEvent("moveDown", {
              detail: {
                stepId: e.currentTarget.id.replace(/^step-/, ""),
                cursorPosition: goalColumn,
              },
            })
          );
        } else {
          console.log('ArrowDown in text-editor mode - not on last line, allowing native behavior');
        }
        // If not on last line, let native behavior handle it (don't preventDefault)
      }
      break;
    case "ArrowRight":
      if (mode === 'text-editor') {
        // Check if cursor is at the end of the text
        const currentPos = getCursorPosition(e.currentTarget);
        const textLength = e.currentTarget.textContent.length;
        
        console.log('ArrowRight in text-editor mode - currentPos:', currentPos, 'textLength:', textLength);
        
        if (currentPos >= textLength) {
          // Cursor is at end, move to next step
          e.preventDefault();
          e.stopPropagation();
          
          console.log('ArrowRight in text-editor mode - at end, moving to next step');
          
          // Set navigating flag
          store.setIsNavigating(true);
          
          dispatchEvent(
            new CustomEvent("moveDown", {
              detail: {
                stepId: e.currentTarget.id.replace(/^step-/, ""),
                cursorPosition: 0, // Go to beginning of next step
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
        
        console.log('ArrowLeft in text-editor mode - currentPos:', currentPos);
        
        if (currentPos <= 0) {
          // Cursor is at beginning, move to previous step
          e.preventDefault();
          e.stopPropagation();
          
          console.log('ArrowLeft in text-editor mode - at beginning, moving to previous step');
          
          // Set navigating flag
          store.setIsNavigating(true);
          
          dispatchEvent(
            new CustomEvent("moveUp", {
              detail: {
                stepId: e.currentTarget.id.replace(/^step-/, ""),
                cursorPosition: -1, // Special value to indicate "go to end"
              },
            })
          );
        }
        // If not at beginning, let native behavior handle it
      }
      break;
    //   e.preventDefault();
    //   newOffset = Math.max(0, editor.selection.focus.offset + 1);
    //   Transforms.select(editor, {
    //     path: editor.selection.focus.path,
    //     offset: newOffset,
    //   });
    //   deps.handlers.updateSelection(e.currentTarget.id, deps);
    //   break;
    // case "ArrowLeft":
    //   e.preventDefault();
    //   newOffset = Math.max(0, editor.selection.focus.offset - 1);
    //   Transforms.select(editor, {
    //     path: editor.selection.focus.path,
    //     offset: newOffset,
    //   });
    //   deps.handlers.updateSelection(e.currentTarget.id, deps);
    //   break;
  }
  // const blockRef = deps.getRefIds()[e.currentTarget.id].elm;

  // blockRef.setAttribute('spellcheck', 'false');

  // requestAnimationFrame(() => {
  // deps.render();
  // })

  // setTimeout(() => {
  //   blockRef.setAttribute('spellcheck', 'true');
  //   deps.render();
  // }, 2000)

  // TODO fix spellcheck underline flickering
};

export const handleStepMouseUp = (e, deps) => {
  const { store } = deps;
  
  // Save cursor position after mouse up (selection change)
  // Use multiple attempts with slight delays to ensure selection is established
  setTimeout(() => {
    const cursorPos = getCursorPosition(e.currentTarget);
    if (cursorPos > 0) {
      console.log('handleStepMouseUp - saving cursor position:', cursorPos);
      store.setCursorPosition(cursorPos);
      store.setGoalColumn(cursorPos);
      console.log('handleStepMouseUp - set goal column:', cursorPos);
    } else {
      // Try again with longer delay if position is 0
      setTimeout(() => {
        const cursorPos2 = getCursorPosition(e.currentTarget);
        console.log('handleStepMouseUp - retry saving cursor position:', cursorPos2);
        store.setCursorPosition(cursorPos2);
        store.setGoalColumn(cursorPos2);
        console.log('handleStepMouseUp - retry set goal column:', cursorPos2);
      }, 10);
    }
  }, 0);
};

export const handleOnInput = (e, deps) => {
  const { dispatchEvent, store } = deps;

  const stepId = e.target.id.replace(/^step-/, "");
  const content = e.target.textContent;

  // Save cursor position on every input
  const cursorPos = getCursorPosition(e.target);
  store.setCursorPosition(cursorPos);

  const detail = {
    stepId,
    content,
  }

  console.log('detail', detail)

  dispatchEvent(
    new CustomEvent("editor-data-chanaged", {
      detail,
    })
  );
};

// Helper function to find the position on the last line closest to goal column
const findLastLinePosition = (element, goalColumn) => {
  const text = element.textContent;
  const textLength = text.length;
  
  console.log('findLastLinePosition - goalColumn:', goalColumn, 'textLength:', textLength);
  
  // If no text or goal column is at end, return end position
  if (textLength === 0 || goalColumn >= textLength) {
    console.log('findLastLinePosition - returning end position:', textLength);
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
  
  console.log('findLastLinePosition - lastLineStartPos:', lastLineStartPos, 'lastLineLength:', lastLineLength, 'positionOnLastLine:', positionOnLastLine, 'finalPosition:', finalPosition);
  
  return finalPosition;
};

export const updateSelectedStep = (stepId, deps) => {
  const { store, getRefIds } = deps;
  const refIds = getRefIds();
  console.log("updateSelectedStep - refIds", refIds);
  const stepRef = refIds[`step-${stepId}`];
  console.log("updateSelectedStep - stepRef", stepRef);
  
  // Get goal column (desired position) instead of current position
  const goalColumn = store.selectGoalColumn() || 0;
  const textLength = stepRef.elm.textContent.length;
  const direction = store.selectNavigationDirection();
  
  // Choose positioning strategy based on direction
  let targetPosition;
  if (direction === 'up') {
    // For upward navigation, find position on last line
    targetPosition = findLastLinePosition(stepRef.elm, goalColumn);
    console.log("updateSelectedStep - UP navigation, goalColumn:", goalColumn, "textLength:", textLength, "targetPosition:", targetPosition);
  } else if (direction === 'end') {
    // For end positioning (ArrowLeft navigation), position at absolute end
    targetPosition = textLength;
    console.log("updateSelectedStep - END navigation, textLength:", textLength, "targetPosition:", targetPosition);
  } else {
    // For downward navigation, use normal goal column positioning
    targetPosition = Math.min(goalColumn, textLength);
    console.log("updateSelectedStep - DOWN navigation, goalColumn:", goalColumn, "textLength:", textLength, "targetPosition:", targetPosition);
  }
  
  // Get shadow root for selection if needed
  let shadowRoot = stepRef.elm.getRootNode();
  let selection = window.getSelection();
  
  // Check if we're in a shadow DOM
  if (shadowRoot && shadowRoot.getSelection) {
    selection = shadowRoot.getSelection();
    console.log('updateSelectedStep - using shadowRoot selection');
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
  
  walkTextNodes(stepRef.elm);
  
  // If we didn't find a position (cursor beyond text), position at end
  if (!foundNode && lastTextNode) {
    console.log("updateSelectedStep - positioning at end of text");
    range.setStart(lastTextNode, lastTextNodeLength);
    range.setEnd(lastTextNode, lastTextNodeLength);
    actualPosition = textLength;
    foundNode = true;
  }
  
  if (foundNode) {
    selection.removeAllRanges();
    selection.addRange(range);
    
    // Update the current cursor position in store to reflect where we actually landed
    store.setCursorPosition(actualPosition);
    console.log("updateSelectedStep - updated cursor position to:", actualPosition);
  }
  
  // Now focus - the selection should be preserved
  stepRef.elm.focus({ preventScroll: true });
};

export const handleOnFocus = (e, deps) => {
  console.log("focus", e);
  const { store, render } = deps;
  const stepId = e.currentTarget.id.replace(/^step-/, "");
  console.log("stepId", stepId);
  
  // Always update the selected step ID
  store.setSelectedStepId(stepId);
  store.setMode('text-editor'); // Switch to text-editor mode on focus
  
  // Check if we're navigating - if so, don't reset cursor or re-render
  if (store.selectIsNavigating()) {
    console.log("handleOnFocus - navigating, skipping render");
    // Reset the flag but don't render
    store.setIsNavigating(false);
    return;
  }
  
  // When user clicks to focus (not navigating), set goal column to current position
  setTimeout(() => {
    const cursorPos = getCursorPosition(e.currentTarget);
    if (cursorPos >= 0) {
      store.setGoalColumn(cursorPos);
      console.log("handleOnFocus - set initial goal column:", cursorPos);
    }
  }, 10);
  
  render();
};

