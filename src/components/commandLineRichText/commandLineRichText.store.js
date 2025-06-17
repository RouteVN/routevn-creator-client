export const INITIAL_STATE = Object.freeze({
  textContent: '',
  formatting: {
    bold: false,
    italic: false,
    underline: false,
    color: '#000000'
  }
});

export const setTextContent = (state, content) => {
  state.textContent = content;
};

export const toggleFormatting = (state, formatType) => {
  if (formatType === 'color') {
    // Color would need special handling
    return;
  }
  state.formatting[formatType] = !state.formatting[formatType];
};

export const setColor = (state, color) => {
  state.formatting.color = color;
};

export const toViewData = ({ state, props }, payload) => {
  return {
    textContent: state.textContent,
    formatting: state.formatting,
  };
};