export const createInitialState = () => ({
  activeLineId: undefined,
});

export const selectViewData = ({ state, props }) => {
  const lines = (props.lines || []).map((line, index) => {
    const isSelected =
      props.selectedLineId === line.id ||
      (!props.selectedLineId && state.activeLineId === line.id);

    return {
      ...line,
      lineNumber: line.lineNumber ?? index + 1,
      lineColor: isSelected ? "fg" : "mu-fg",
      backgroundColor: isSelected ? "var(--muted)" : "transparent",
      dialogueContent: line?.actions?.dialogue?.content ?? [{ text: "" }],
    };
  });

  return {
    lines,
    selectedLineId: props.selectedLineId ?? state.activeLineId,
    showLineNumbers: props.showLineNumbers ?? true,
  };
};

export const setActiveLineId = ({ state }, { lineId } = {}) => {
  state.activeLineId = lineId;
};
