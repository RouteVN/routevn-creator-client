import { withErrorDetails } from "../../errorDetails.js";
import { isProjectStorageUnavailableError } from "../../projectOpenErrors.js";
import { isStorageFullError } from "../../storageFullError.js";

const STORAGE_FULL_FALLBACK_MESSAGE =
  "There is not enough free storage space on this device to save this. Free up some space, then try again.";

// The failure behind a refused result, or the thrown error itself.
const getTechnicalError = (errorOrResult) =>
  errorOrResult?.valid === false ? errorOrResult.error : errorOrResult;

// The caller's localized message leads. The failure's own text is not in the
// app language, so it follows under the localized details label.
export const getResourcePageErrorMessage = ({
  appService,
  errorOrResult,
  fallbackMessage,
} = {}) => {
  const copy = appService.getAppCopy?.() ?? {};
  // A full device is the user's to fix: say so in the app language, whatever
  // language or wording the system's own message has.
  if (
    isStorageFullError(errorOrResult) ||
    isStorageFullError(errorOrResult?.error)
  ) {
    return copy.storageFullMessage ?? STORAGE_FULL_FALLBACK_MESSAGE;
  }

  return withErrorDetails(
    fallbackMessage,
    getTechnicalError(errorOrResult),
    copy.errorDetailsLabel ?? "Details:",
  );
};

export const showResourcePageError = ({
  appService,
  errorOrResult,
  fallbackMessage,
  title,
} = {}) => {
  const message = getResourcePageErrorMessage({
    appService,
    errorOrResult,
    fallbackMessage,
  });
  appService.showAlert({
    message: message,
    title: title ?? appService.getAppCopy?.().errorTitle ?? "Error",
  });
  return message;
};

export const runResourcePageMutation = async ({
  appService,
  action,
  fallbackMessage,
  title,
  logLabel = fallbackMessage,
} = {}) => {
  try {
    const result = await action();

    if (result?.valid === false) {
      console.error(logLabel, result);
      showResourcePageError({
        appService,
        errorOrResult: result,
        fallbackMessage,
        title,
      });
      return {
        ok: false,
        result,
      };
    }

    return {
      ok: true,
      result,
    };
  } catch (error) {
    console.error(logLabel, error);
    if (!isProjectStorageUnavailableError(error)) {
      appService.reportError(error, { operation: "resourcePage.mutation" });
    }
    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage,
      title,
    });
    return {
      ok: false,
      error,
    };
  }
};
