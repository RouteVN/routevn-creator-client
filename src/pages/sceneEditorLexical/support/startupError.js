import { getComputedVariableErrorName } from "../../../internal/computedVariableError.js";
import { selectSceneEditorCopy } from "../../../internal/ui/sceneEditor/sceneEditorCopy.js";

export const getSceneStartupErrorMessage = ({
  error,
  projectService,
  i18n,
}) => {
  const copy = selectSceneEditorCopy(i18n);
  const variableName = getComputedVariableErrorName(error, () =>
    projectService.getRepositoryState(),
  );
  if (!variableName) return copy.failedOpenScene;
  return copy.computedVariableFailed.replaceAll("{name}", () => variableName);
};
