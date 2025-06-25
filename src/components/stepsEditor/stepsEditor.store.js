export const INITIAL_STATE = Object.freeze({
  mode: 'block', // 'block' or 'text-editor'
  cursorPosition: 0, // Track cursor position for navigation
  goalColumn: 0, // Remember the desired column when moving vertically
  isNavigating: false, // Flag to prevent cursor reset during navigation
  navigationDirection: 'down', // 'up' or 'down' - for proper cursor positioning
  repositoryState: {},
});


export const setMode = (state, mode) => {
  state.mode = mode;
}

export const setRepositoryState = (state, repositoryState) => {
  state.repositoryState = repositoryState;
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

    let backgroundFileId;
    if (step.instructions.presentationInstructions.background) {
      console.log('step.instructions.presentationInstructions.background', step.instructions.presentationInstructions.background)
      const imageId = step.instructions.presentationInstructions.background.imageId;
      console.log('state.repositoryState.images.items', state.repositoryState.images.items)
      backgroundFileId = state.repositoryState.images.items[imageId]?.fileId;
      console.log('backgroundFileId', backgroundFileId)
    }

    return {
      ...step,
      lineNumber: i + 1,
      lineColor: isSelected ? 'fg' : 'mu-fg',
      backgroundColor: (isSelected && isBlockMode) ? 'var(--muted)' : 'transparent',
      backgroundFileId,
    }
  });
  return {
    steps,
    selectedStepId: props.selectedStepId,
    mode: state.mode,
  }
}
