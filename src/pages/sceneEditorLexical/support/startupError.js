import { selectSceneEditorCopy } from "../../../internal/ui/sceneEditor/sceneEditorCopy.js";

// route-engine-js names a failing computed variable only in its message.
const COMPUTED_VARIABLE_ERROR = /^Computed variable "([^"]+)"/;

export const getSceneStartupErrorMessage = ({
  error,
  projectService,
  i18n,
}) => {
  const copy = selectSceneEditorCopy(i18n);
  const variableId = COMPUTED_VARIABLE_ERROR.exec(error?.message)?.[1];
  if (!variableId) return copy.failedOpenScene;
  // Computed variables are evaluated only after the repository has loaded.
  const variable =
    projectService.getRepositoryState().variables?.items?.[variableId];
  if (variable?.computed === undefined) return copy.failedOpenScene;
  return copy.failedOpenSceneComputedVariable.replaceAll(
    "{name}",
    () => variable.name,
  );
};
