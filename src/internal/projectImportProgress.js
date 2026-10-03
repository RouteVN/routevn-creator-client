import { formatFileSize } from "./files.js";

const formatCopy = (template, replacements) => {
  let text = template;
  Object.entries(replacements).forEach(([key, value]) => {
    text = text.replaceAll(`{${key}}`, value);
  });
  return text;
};

const toPercent = (current, total) => {
  return Math.min(100, Math.floor((current / total) * 100));
};

// Progress dialog view for one native import event. Stages: "downloading"
// (bytes received of the content length, total 0 when unknown), "extracting"
// (uncompressed bytes written of the declared total) and "finishing".
export const createProjectImportProgressView = ({ copy, event }) => {
  const current = Math.max(0, Number(event?.current) || 0);
  const total = Math.max(0, Number(event?.total) || 0);

  if (event?.stage === "downloading") {
    if (total > 0) {
      return {
        status: formatCopy(copy.importDownloadingStatus, {
          received: formatFileSize(current),
          total: formatFileSize(total),
          percent: String(toPercent(current, total)),
        }),
        progress: { current: Math.min(current, total), total },
      };
    }
    return {
      status: formatCopy(copy.importDownloadingUnknownStatus, {
        received: formatFileSize(current),
      }),
      progress: {},
    };
  }

  if (event?.stage === "extracting" && total > 0) {
    return {
      status: formatCopy(copy.importExtractingStatus, {
        percent: String(toPercent(current, total)),
      }),
      progress: { current: Math.min(current, total), total },
    };
  }

  return { status: copy.importFinishingStatus, progress: {} };
};
