export const createInitialState = () => ({});

// Labels for the editor's right-click and variable menus. Variable types use
// the same words as the variable pickers in the line actions.
const selectMenuLabels = (i18n) => {
  const copy = i18n.sceneEditorPage;
  const commandLineCopy = i18n.commandLinePage;

  return {
    changeVariable: copy.changeVariableMenuItem,
    removeVariable: copy.removeVariableMenuItem,
    addTextStyle: copy.addTextStyleMenuItem,
    editTextStyle: copy.editTextStyleMenuItem,
    removeTextStyle: copy.removeTextStyleMenuItem,
    addRubyText: copy.addRubyTextMenuItem,
    editRubyText: copy.editRubyTextMenuItem,
    removeRubyText: copy.removeRubyTextMenuItem,
    noVariables: copy.noVariablesMenuItem,
    noTextStyles: copy.noTextStylesMenuItem,
    variableTypes: {
      string: commandLineCopy.string,
      number: commandLineCopy.number,
      boolean: commandLineCopy.boolean,
    },
  };
};

export const selectViewData = ({ props, i18n }) => ({
  lines: props.lines || [],
  lineDecorations: props.lineDecorations || [],
  selectedLineId: props.selectedLineId,
  selectionActive: props.selectionActive ?? true,
  hasPreviousSectionLine: props.hasPreviousSectionLine ?? false,
  hasNextSectionLine: props.hasNextSectionLine ?? false,
  showLineNumbers: props.showLineNumbers ?? true,
  fontSize: props.fontSize ?? "md",
  textStyles: props.textStyles || [],
  mentionTargets: props.mentionTargets || [],
  compactPreviews: props.compactPreviews ?? false,
  menuLabels: selectMenuLabels(i18n),
});
