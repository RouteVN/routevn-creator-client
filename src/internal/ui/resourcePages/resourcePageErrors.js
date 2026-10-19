import { isProjectStorageUnavailableError } from "../../projectOpenErrors.js";
import { isStorageFullError } from "../../storageFullError.js";

const STORAGE_FULL_FALLBACK_MESSAGE =
  "There is not enough free storage space on this device to save this. Free up some space, then try again.";

export const getResourcePageErrorMessage = (errorOrResult, fallbackMessage) => {
  if (typeof errorOrResult === "string") {
    return errorOrResult;
  }

  if (typeof errorOrResult?.error === "string") {
    return errorOrResult.error;
  }

  return (
    errorOrResult?.error?.message ||
    errorOrResult?.error?.creatorModelError?.message ||
    errorOrResult?.message ||
    fallbackMessage
  );
};

export const showResourcePageError = ({
  appService,
  errorOrResult,
  fallbackMessage,
  title = "Error",
} = {}) => {
  // A full device is the user's to fix: say so in the app language, whatever
  // language or wording the system's own message has.
  const message =
    isStorageFullError(errorOrResult) ||
    isStorageFullError(errorOrResult?.error)
      ? (appService.getAppCopy?.().storageFullMessage ??
        STORAGE_FULL_FALLBACK_MESSAGE)
      : getResourcePageErrorMessage(errorOrResult, fallbackMessage);
  appService.showAlert({ message: message, title });
  return message;
};

export const runResourcePageMutation = async ({
  appService,
  action,
  fallbackMessage,
  title = "Error",
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
