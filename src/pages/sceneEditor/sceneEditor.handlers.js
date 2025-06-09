export const handleOnMount = (deps) => {
  const { store, render, localData, getRefIds } = deps;
  const { steps } = localData["scene:1"].toJSON();
  store.setCurrentSteps(steps);
  store.setSelectedStepId(steps[0].id);
  render();
  requestAnimationFrame(() => {
    const stepsEditorRef = getRefIds()["steps-editor"];
    stepsEditorRef.elm.transformedHandlers.updateSelectedStep(
      steps[steps.length - 1].id
    );
  });
};

export const handleEditorDataChanaged = (e, deps) => {
  console.log("editor data changed", e.detail);
};

export const handleNewLine = (e, deps) => {
  const { store, getRefIds, render, localData } = deps;
  const stepsEditorRef = getRefIds()["steps-editor"];

  const stepsLocalData = localData["scene:1"];
  stepsLocalData.addStep();
  const { steps } = stepsLocalData.toJSON();
  store.setCurrentSteps(steps);
  store.setSelectedStepId(steps[steps.length - 1].id);
  render();

  requestAnimationFrame(() => {
    stepsEditorRef.elm.transformedHandlers.updateSelectedStep(
      steps[steps.length - 1].id
    );
    render();
  });
};

export const handleMoveUp = (e, deps) => {
  const { store, localData, getRefIds, render } = deps;
  const previousStepId = store.selectPreviousStepId(e.detail.stepId);
  console.log("move up", e.detail.stepId);
  console.log("previousStepId", previousStepId);

  const stepsEditorRef = getRefIds()["steps-editor"];
  stepsEditorRef.elm.transformedHandlers.updateSelectedStep(previousStepId);

  store.setSelectedStepId(previousStepId);
  render();
};

export const handleMoveDown = (e, deps) => {
  const { store, localData, getRefIds, render } = deps;
  const nextStepId = store.selectNextStepId(e.detail.stepId);
  console.log("move down", e.detail.stepId);
  console.log("nextStepId", nextStepId);

  const stepsEditorRef = getRefIds()["steps-editor"];
  stepsEditorRef.elm.transformedHandlers.updateSelectedStep(nextStepId);

  store.setSelectedStepId(nextStepId);
  render();
};

export const handleBackgroundActionClick = (e, deps) => {
  const { store, render } = deps;
  store.setMode('actions');
  render();
};

export const handleActionsOverlayClick = (e, deps) => {
  const { store, render } = deps;
  store.setMode('steps-editor');
  render();
};

export const handleActionsContainerClick = (e, deps) => {
  e.stopPropagation();
};

export const handleActionClicked = (e, deps) => {
  const { store, render } = deps;
  // console.log('e.deatil', e.detail)
  store.setMode(e.detail.item.mode);
  render();
}

