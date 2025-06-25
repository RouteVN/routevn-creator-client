export const INITIAL_STATE = Object.freeze({
  stepContent: '', // Raw step content from props
  formattedRanges: [], // Array of {start, end, formats: {bold, italic, underline, strikethrough}}
  selectedRange: null, // {start, end, text}
  hasSelection: false
});

export const setStepContent = (state, content) => {
  state.stepContent = content;
};

export const setSelectedRange = (state, range) => {
  state.selectedRange = range;
  state.hasSelection = range !== null;
};

export const addFormatting = (state, { start, end, formatType }) => {
  if (!state.selectedRange) return;
  
  // Find existing range or create new one
  let existingRange = state.formattedRanges.find(r => r.start === start && r.end === end);
  
  if (existingRange) {
    // Toggle the formatting
    existingRange.formats[formatType] = !existingRange.formats[formatType];
    
    // Remove range if no formats are active
    const hasActiveFormats = Object.values(existingRange.formats).some(Boolean);
    if (!hasActiveFormats) {
      state.formattedRanges = state.formattedRanges.filter(r => r !== existingRange);
    }
  } else {
    // Create new formatted range
    const newRange = {
      start,
      end,
      formats: {
        bold: formatType === 'bold',
        italic: formatType === 'italic',
        underline: formatType === 'underline',
        strikethrough: formatType === 'strikethrough'
      }
    };
    state.formattedRanges.push(newRange);
  }
};

export const clearSelection = (state) => {
  state.selectedRange = null;
  state.hasSelection = false;
};

export const toViewData = ({ state, props }, payload) => {
  // TODO: Fix prop passing - should receive step content from scene editor
  const content = props?.stepContent || state.stepContent || 'No content available - props not working yet';
  
  // Generate formatted HTML content
  const formattedContent = generateFormattedHTML(content, state.formattedRanges);
  
  return {
    formattedContent,
    selectedText: state.selectedRange?.text || '',
    hasSelection: state.hasSelection,
  };
};

// Helper function to generate HTML with formatting
const generateFormattedHTML = (content, ranges) => {
  if (!ranges.length) {
    return escapeHtml(content);
  }
  
  // Sort ranges by start position
  const sortedRanges = [...ranges].sort((a, b) => a.start - b.start);
  
  let result = '';
  let lastIndex = 0;
  
  for (const range of sortedRanges) {
    // Add unformatted text before this range
    result += escapeHtml(content.slice(lastIndex, range.start));
    
    // Add formatted text
    const rangeText = content.slice(range.start, range.end);
    let formattedText = escapeHtml(rangeText);
    
    // Apply formatting
    if (range.formats.bold) formattedText = `<strong>${formattedText}</strong>`;
    if (range.formats.italic) formattedText = `<em>${formattedText}</em>`;
    if (range.formats.underline) formattedText = `<u>${formattedText}</u>`;
    if (range.formats.strikethrough) formattedText = `<s>${formattedText}</s>`;
    
    result += formattedText;
    lastIndex = range.end;
  }
  
  // Add remaining unformatted text
  result += escapeHtml(content.slice(lastIndex));
  
  return result;
};

// Helper function to escape HTML
const escapeHtml = (text) => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

export const selectStepContent = ({ state }) => {
  return state.stepContent;
};

export const selectSelectedRange = ({ state }) => {
  return state.selectedRange;
};

export const selectFormattedRanges = ({ state }) => {
  return state.formattedRanges;
};