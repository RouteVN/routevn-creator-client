export const createInitialState = () => ({});

export const selectViewData = ({ props }) => ({
  lines: props.lines || [],
  lineDecorations: props.lineDecorations || [],
  selectedLineId: props.selectedLineId,
  selectionActive: props.selectionActive ?? true,
  showLineNumbers: props.showLineNumbers ?? true,
  fontSize: props.fontSize ?? "md",
  textStyles: props.textStyles || [],
  mentionTargets: props.mentionTargets || [],
});
