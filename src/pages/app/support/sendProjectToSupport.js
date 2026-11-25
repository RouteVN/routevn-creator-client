import {
  MAX_SUPPORT_UPLOAD_BYTES,
  normalizeDebugCode,
} from "../../../internal/supportUpload.js";
import { withErrorDetails } from "../../../internal/errorDetails.js";
import { formatFileSize } from "../../../internal/files.js";
import { formatI18nCopy } from "../../../internal/ui/i18nCopy.js";

const percentOf = (current, total) =>
  total > 0 ? Math.min(100, Math.floor((current / total) * 100)) : 0;

// The progress dialog for one event of a send. Packing the project and
// checking the packed file share one bar, half each; the upload shows the
// bytes sent.
export const createSendProgressView = ({ copy, dateTime, event }) => {
  const current = Math.max(0, Number(event.current) || 0);
  const total = Math.max(0, Number(event.total) || 0);
  if (event.stage === "packing" || event.stage === "checking") {
    const half = percentOf(current, total) / 2;
    const percent = Math.floor(event.stage === "packing" ? half : 50 + half);
    return {
      status: formatI18nCopy(copy.preparingStatus, {
        percent: String(percent),
      }),
      progress: { current: percent, total: 100 },
    };
  }
  if (event.stage === "uploading") {
    return {
      status: formatI18nCopy(copy.uploadingStatus, {
        sent: formatFileSize(Math.min(current, total), dateTime),
        total: formatFileSize(total, dateTime),
        percent: String(percentOf(current, total)),
      }),
      progress: { current: Math.min(current, total), total },
    };
  }
  return { status: copy.finishingStatus, progress: {} };
};

// The day support's copy is deleted, in the user's time zone.
const formatDeleteDate = (epochMs, { intlLocale, monthStyle }) =>
  new Date(epochMs).toLocaleDateString(intlLocale, {
    year: "numeric",
    month: monthStyle,
    day: "numeric",
  });

const MESSAGE_KEYS = Object.freeze({
  codeUnknown: "codeUnknownMessage",
  codeExpired: "codeExpiredMessage",
  codeUsed: "codeUsedMessage",
  rateLimited: "rateLimitedMessage",
  tooLarge: "tooLargeMessage",
  tooManyAttempts: "tooManyAttemptsMessage",
  unavailable: "unavailableMessage",
});

// What the user is told when the project was not sent. Expected outcomes,
// such as a wrong or used code, say what to do next; anything else adds the
// technical details.
export const getSendErrorMessage = (
  error,
  { copy, code, dateTime, errorDetailsLabel },
) => {
  const key = MESSAGE_KEYS[error?.code];
  if (key) {
    return formatI18nCopy(copy[key], {
      code: normalizeDebugCode(code),
      size: formatFileSize(MAX_SUPPORT_UPLOAD_BYTES, dateTime),
    });
  }
  return withErrorDetails(
    copy.failedMessage,
    error?.cause ?? error,
    errorDetailsLabel,
  );
};

// Sends the project at `projectPath` with `code`, showing progress with a
// Cancel button until the upload has finished, then the outcome. Cancelling
// closes the progress without an alert.
export const sendProjectToSupport = async (
  { appService, i18n },
  { projectPath, code },
) => {
  const copy = i18n.sendProjectDialog;
  const cancel = {
    label: copy.cancelButton,
    onCancel: async () => {
      progressDialog.update({
        cancel: { label: copy.cancellingButton, disabled: true },
      });
      await appService.cancelSendingProjectToSupport();
    },
  };
  const initialView = createSendProgressView({
    copy,
    dateTime: i18n.dateTime,
    event: { stage: "packing" },
  });
  const progressDialog = appService.showProgressDialog({
    title: copy.progressTitle,
    message: copy.progressMessage,
    status: initialView.status,
    progress: initialView.progress,
    cancel,
  });
  await progressDialog.waitForPaint();

  const onProgress = (event) => {
    const view = createSendProgressView({
      copy,
      dateTime: i18n.dateTime,
      event,
    });
    // The bytes are with support once the upload ends: from then on the
    // send is not stopped.
    if (event.stage === "finishing") {
      view.cancel = { label: copy.cancelButton, disabled: true };
    }
    progressDialog.update(view);
  };

  let result;
  try {
    result = await appService.sendProjectToSupport({
      projectPath,
      code,
      onProgress,
    });
  } catch (error) {
    progressDialog.close();
    if (error?.code === "cancelled") return;
    appService.showAlert({
      title: copy.notSentTitle,
      message: getSendErrorMessage(error, {
        copy,
        code,
        dateTime: i18n.dateTime,
        errorDetailsLabel: i18n.appPage.errorDetailsLabel,
      }),
    });
    return;
  }
  progressDialog.close();
  appService.showAlert({
    title: copy.sentTitle,
    message: formatI18nCopy(copy.sentMessage, {
      date: formatDeleteDate(result.deleteAfter, i18n.dateTime),
    }),
  });
};
