// Load panel width from localStorage, fallback to default (only for file-explorer)
const getStoredPanelWidth = (defaultWidth = 280, panelType = 'file-explorer') => {
  if (panelType === 'detail-panel') {
    return defaultWidth; // Don't store detail panel width
  }
  
  try {
    const stored = localStorage.getItem('resizablePanelWidth');
    return stored ? parseInt(stored, 10) : defaultWidth;
  } catch (e) {
    return defaultWidth;
  }
};

export const INITIAL_STATE = Object.freeze({
  panelWidth: 280, // Will be updated based on attrs
  isResizing: false,
  startX: 0,
  startWidth: 280,
});

export const setPanelWidth = (state, width, attrs = {}) => {
  // Use attrs for min/max if available, otherwise use defaults
  const minWidth = parseInt(attrs.minW) || 200;
  const maxWidth = parseInt(attrs.maxW) || 600;
  const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, width));
  state.panelWidth = constrainedWidth;
  
  // Only save file-explorer panels to localStorage
  if (attrs.panelType !== 'detail-panel') {
    try {
      localStorage.setItem('resizablePanelWidth', constrainedWidth.toString());
    } catch (e) {
      // Ignore localStorage errors
    }
  }
}

export const setIsResizing = (state, isResizing) => {
  state.isResizing = isResizing;
}

export const setResizeStart = (state, { startX, startWidth }) => {
  state.startX = startX;
  state.startWidth = startWidth;
}

export const initializePanelWidth = (state, attrs) => {
  const defaultWidth = parseInt(attrs.w) || 280;
  
  if (attrs.panelType === 'detail-panel') {
    // Detail panels always use the attr width, no localStorage
    state.panelWidth = defaultWidth;
    state.startWidth = defaultWidth;
  } else {
    // File explorer panels use localStorage
    const storedWidth = getStoredPanelWidth(defaultWidth, attrs.panelType);
    state.panelWidth = storedWidth;
    state.startWidth = storedWidth;
  }
}

export const toViewData = ({ state, attrs }) => {
  return {
    w: parseInt(attrs.w) || 280,
    minW: parseInt(attrs.minW) || 200,
    maxW: parseInt(attrs.maxW) || 600,
    resizeFrom: attrs.resizeFrom || 'right',
    panelType: attrs.panelType || 'file-explorer',
    panelWidth: state.panelWidth,
    isResizing: state.isResizing,
  };
}