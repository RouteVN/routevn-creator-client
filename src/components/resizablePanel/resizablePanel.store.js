// Load panel width from localStorage, fallback to 280
const getStoredPanelWidth = () => {
  try {
    const stored = localStorage.getItem('resizablePanelWidth');
    return stored ? parseInt(stored, 10) : 280;
  } catch (e) {
    return 280;
  }
};

const initialWidth = getStoredPanelWidth();

export const INITIAL_STATE = Object.freeze({
  panelWidth: initialWidth,
  isResizing: false,
  startX: 0,
  startWidth: initialWidth,
});

export const setPanelWidth = (state, width) => {
  // Use props for min/max if available, otherwise use defaults
  const minWidth = 200;
  const maxWidth = 600;
  const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, width));
  state.panelWidth = constrainedWidth;
  
  // Save to localStorage
  try {
    localStorage.setItem('resizablePanelWidth', constrainedWidth.toString());
  } catch (e) {
    // Ignore localStorage errors
  }
}

export const setIsResizing = (state, isResizing) => {
  state.isResizing = isResizing;
}

export const setResizeStart = (state, { startX, startWidth }) => {
  state.startX = startX;
  state.startWidth = startWidth;
}

export const toViewData = ({ state, props }, payload) => {
  // Initialize width from props if provided and no localStorage value exists
  const storedWidth = getStoredPanelWidth();
  if (props.initialWidth && storedWidth === 280 && state.panelWidth === 280) {
    state.panelWidth = props.initialWidth;
    // Save the initial width to localStorage
    try {
      localStorage.setItem('resizablePanelWidth', props.initialWidth.toString());
    } catch (e) {
      // Ignore localStorage errors
    }
  }

  return {
    ...props,
    panelWidth: state.panelWidth,
    isResizing: state.isResizing,
    resizeHandleClass: state.isResizing ? 'resizing' : '',
  };
}