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

export const toViewData = ({ state, props }) => {
  const lines = (props.lines || []).map((line, i) => {
    const isSelected = props.selectedLineId === line.id;
    const isBlockMode = state.mode === 'block';

    let backgroundFileId;
    if (line.presentation?.background) {
      const imageId = line.presentation.background.imageId;
      backgroundFileId = state.repositoryState.images.items[imageId]?.fileId;
    }

    let characterFileId;
    if (line.presentation?.dialogue?.characterId) {
      const characterId = line.presentation.dialogue.characterId;
      characterFileId = state.repositoryState.characters?.items?.[characterId]?.fileId;
    }

    return {
      ...line,
      lineNumber: i + 1,
      lineColor: isSelected ? 'fg' : 'mu-fg',
      backgroundColor: (isSelected && isBlockMode) ? 'var(--muted)' : 'transparent',
      backgroundFileId,
      characterFileId,
    }
  });
  return {
    lines,
    selectedLineId: props.selectedLineId,
    mode: state.mode,
  }
}
