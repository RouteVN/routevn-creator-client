import { withErrorDetails } from "../../../internal/errorDetails.js";

// A save reports a refusal as a `{ valid: false, error }` result and an
// unexpected failure as a thrown error. Both come out as an Error that says
// what the store said, so an alert and a report show the real reason. The
// platform shells reject with strings and plain objects as well.
export const toLayoutEditorSaveError = (failure, fallbackMessage) => {
  if (failure instanceof Error) {
    return failure;
  }

  const error = new Error(
    typeof failure === "string"
      ? failure
      : failure?.message ||
        failure?.creatorModelError?.message ||
        fallbackMessage,
  );
  error.code = failure?.code;
  return error;
};

// Reports a save that failed and, unless a failure was announced a moment
// ago, tells the user why in their language, with the technical details under
// it. The alert waits for any open dialog, because a save fails in the
// background, such as when the page is left.
export const notifyLayoutEditorSaveFailure = ({
  appService,
  detailsLabel,
  error,
  message,
  operation,
  showAlert = true,
  title,
}) => {
  appService.reportError(error, { operation });
  if (showAlert) {
    appService.showAlertWhenIdle({
      title,
      message: withErrorDetails(message, error, detailsLabel),
    });
  }
};
