export const createInitialState = () => ({});

export const selectViewData = ({ props }) => ({
  lines: props.lines || [],
  lineDecorations: props.lineDecorations || [],
  selectedLineId: props.selectedLineId,
  showLineNumbers: props.showLineNumbers ?? true,
  textStyles: props.textStyles || [],
  mentionTargets: props.mentionTargets || [],
});
