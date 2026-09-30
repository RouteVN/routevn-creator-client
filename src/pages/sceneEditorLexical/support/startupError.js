import { selectSceneEditorCopy } from "../../../internal/ui/sceneEditor/sceneEditorCopy.js";

export const getSceneStartupErrorMessage = ({
  error,
  repositoryState,
  i18n,
}) => {
  const copy = selectSceneEditorCopy(i18n);
  // The engine exposes the computed variable ID in its message, without metadata.
  const match =
    error instanceof Error
      ? /^Computed variable "([^"]+)" (.+)$/.exec(error.message)
      : undefined;
  if (!match) return copy.failedOpenScene;
  const variable = repositoryState?.variables?.items?.[match[1]];
  if (variable?.computed === undefined) return copy.failedOpenScene;

  const template =
    match[2] === "expected type number, got number"
      ? copy.failedOpenSceneInvalidNumber
      : copy.failedOpenSceneComputedVariable;
  return template.replaceAll("{name}", () => variable.name);
};
