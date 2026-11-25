export const handleDialogClose = (deps) => {
  const { dispatchEvent } = deps;
  dispatchEvent(new CustomEvent("close"));
};

// Sends `{ code, projectId }` once the form is valid: the code has six
// characters of the code alphabet, and a project is chosen.
export const handleFormAction = (deps, payload) => {
  const { dispatchEvent } = deps;
  const { actionId, valid, values } = payload._event.detail;
  if (actionId !== "send" || !valid) return;
  dispatchEvent(
    new CustomEvent("submit", {
      detail: { code: values.code, projectId: values.projectId },
    }),
  );
};
