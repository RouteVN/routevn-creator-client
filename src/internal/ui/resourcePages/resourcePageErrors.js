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
  const message = getResourcePageErrorMessage(errorOrResult, fallbackMessage);
  appService.showToast(message, { title });
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
