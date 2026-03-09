export const createInitialState = () => ({
  ready: false,
  mode: "block", // 'block' or 'text-editor'
  cursorPosition: 0, // Track cursor position for navigation
  goalColumn: 0, // Remember the desired column when moving vertically
  isNavigating: false, // Flag to prevent cursor reset during navigation
  navigationDirection: null, // 'up', 'down', 'end', or null - for proper cursor positioning
  awaitingCharacterShortcut: false,
  awaitingDeleteShortcut: false,
});

export const setMode = ({ state }, { mode } = {}) => {
  state.mode = mode;
  if (mode !== "block") {
    state.awaitingCharacterShortcut = false;
    state.awaitingDeleteShortcut = false;
  }
};

export const setReady = ({ state }, _payload = {}) => {
  state.ready = true;
};

export const setCursorPosition = ({ state }, { position } = {}) => {
  state.cursorPosition = position;
};

export const setIsNavigating = ({ state }, { isNavigating } = {}) => {
  state.isNavigating = isNavigating;
};

export const setGoalColumn = ({ state }, { goalColumn } = {}) => {
  state.goalColumn = goalColumn;
};

export const setNavigationDirection = ({ state }, { direction } = {}) => {
  state.navigationDirection = direction;
};

export const setAwaitingCharacterShortcut = (
  { state },
  { awaitingCharacterShortcut } = {},
) => {
  state.awaitingCharacterShortcut = awaitingCharacterShortcut;
};

export const setAwaitingDeleteShortcut = (
  { state },
  { awaitingDeleteShortcut } = {},
) => {
  state.awaitingDeleteShortcut = awaitingDeleteShortcut;
};

export const selectMode = ({ state }) => {
  return state.mode;
};

export const selectCursorPosition = ({ state }) => {
  return state.cursorPosition;
};

export const selectIsNavigating = ({ state }) => {
  return state.isNavigating;
};

export const selectGoalColumn = ({ state }) => {
  return state.goalColumn;
};

export const selectNavigationDirection = ({ state }) => {
  return state.navigationDirection;
};

export const selectAwaitingCharacterShortcut = ({ state }) => {
  return state.awaitingCharacterShortcut;
};

export const selectAwaitingDeleteShortcut = ({ state }) => {
  return state.awaitingDeleteShortcut;
};

export const selectLineContent = ({ props }, payload) => {
  const { lineId } = payload;
  const line = (props.lines || []).find((item) => item.id === lineId);
  return line?.actions?.dialogue?.content?.[0]?.text ?? "";
};

export const selectViewData = ({ state, props }) => {
  const lines = (props.lines || []).map((line, index) => {
    const isSelected = props.selectedLineId === line.id;
    const isBlockMode = state.mode === "block";

    return {
      ...line,
      lineNumber: line.lineNumber ?? index + 1,
      lineColor: isSelected ? "fg" : "mu-fg",
      backgroundColor:
        isSelected && isBlockMode ? "var(--muted)" : "transparent",
    };
  });

  return {
    lines,
    selectedLineId: props.selectedLineId,
    mode: state.mode,
    ready: state.ready,
  };
};
