import { getComputedVariableErrorName } from "../../../internal/computedVariableError.js";
import { withErrorDetails } from "../../../internal/errorDetails.js";
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
  if (!variableName) {
    return withErrorDetails(
      copy.failedOpenScene,
      error,
      copy.errorDetailsLabel,
    );
  }
  return copy.computedVariableFailed.replaceAll("{name}", () => variableName);
};
