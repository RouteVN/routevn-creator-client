// route-engine-js names a failing computed variable only in its message. When
// the engine's own cleanup also fails, the error arrives inside an
// AggregateError.
export const getComputedVariableErrorId = (error) =>
  /^Computed variable "([^"]+)"/.exec(error?.message)?.[1] ??
  (error?.errors ?? []).map(getComputedVariableErrorId).find(Boolean);

export const getComputedVariableErrorName = (error, getRepositoryState) => {
  const variableId = getComputedVariableErrorId(error);
  if (!variableId) return undefined;
  // Computed variables are evaluated only after the repository has loaded.
  const variable = getRepositoryState().variables?.items?.[variableId];
  return variable?.computed === undefined ? undefined : variable.name;
};
