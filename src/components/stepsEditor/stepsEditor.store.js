export const INITIAL_STATE = Object.freeze({
  mode: 'block', // 'block' or 'text-editor'
  cursorPosition: 0, // Track cursor position for navigation
  goalColumn: 0, // Remember the desired column when moving vertically
  isNavigating: false, // Flag to prevent cursor reset during navigation
  navigationDirection: 'down', // 'up' or 'down' - for proper cursor positioning
});


export const setMode = (state, mode) => {
  state.mode = mode;
}

export const setCursorPosition = (state, position) => {
  state.cursorPosition = position;
}

export const setIsNavigating = (state, isNavigating) => {
  state.isNavigating = isNavigating;
}

export const setGoalColumn = (state, goalColumn) => {
  state.goalColumn = goalColumn;
}

export const setNavigationDirection = (state, direction) => {
  state.navigationDirection = direction;
}

export const selectMode = ({ state }) => {
  return state.mode;
}


export const selectCursorPosition = ({ state }) => {
  return state.cursorPosition;
}

export const selectIsNavigating = ({ state }) => {
  return state.isNavigating;
}

export const selectGoalColumn = ({ state }) => {
  return state.goalColumn;
}

export const selectNavigationDirection = ({ state }) => {
  return state.navigationDirection;
}

export const toViewData = ({ state, props }, payload) => {
  const steps = (props.steps || []).map((step, i) => {
    const isSelected = props.selectedStepId === step.id;
    const isBlockMode = state.mode === 'block';
    return {
      ...step,
      lineNumber: i + 1,
      lineColor: isSelected ? 'fg' : 'mu-fg',
      backgroundColor: (isSelected && isBlockMode) ? 'var(--muted)' : 'transparent',
    }
  });
  return {
    steps,
    selectedStepId: props.selectedStepId,
    mode: state.mode,
  }
}
