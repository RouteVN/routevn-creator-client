import { createUserConfig } from '../../deps/userConfig.js';

const userConfig = createUserConfig();

// Load panel width from localStorage using userConfig pattern
const getStoredPanelWidth = (defaultWidth = 280, panelType = 'file-explorer') => {
  try {
    const configKey = `resizablePanel.${panelType}Width`;
    const stored = userConfig.get(configKey);
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
  
  // Save both file-explorer and detail-panel widths to localStorage using userConfig
  const panelType = attrs.panelType || 'file-explorer';
  try {
    const configKey = `resizablePanel.${panelType}Width`;
    userConfig.set(configKey, constrainedWidth.toString());
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

export const initializePanelWidth = (state, attrs) => {
  const panelType = attrs.panelType || 'file-explorer';
  
  // Set different default widths based on panel type
  let defaultWidth;
  if (panelType === 'detail-panel') {
    defaultWidth = parseInt(attrs.w) || 270; // Default width for detail panels
  } else {
    defaultWidth = parseInt(attrs.w) || 280; // Normal width for file explorer
  }
  
  const storedWidth = getStoredPanelWidth(defaultWidth, panelType);
  state.panelWidth = storedWidth;
  state.startWidth = storedWidth;
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