import { createProgressDialog } from "./progressDialog.js";

const UPDATE_CHECK_DIALOG_ID = "routevn-update-check-dialog";

export const createUpdateCheckProgress = (copy = {}) => {
  let dialog;
  let closed = false;
  const timer = setTimeout(() => {
    if (closed) return;
    dialog = createProgressDialog({
      id: UPDATE_CHECK_DIALOG_ID,
      title: copy.checkingForUpdates ?? "Checking for updates...",
      progress: {},
      announceTitle: true,
    });
  }, 200);

  return {
    close() {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      dialog?.close();
    },
  };
};
