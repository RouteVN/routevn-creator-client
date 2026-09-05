import { createProgressDialog } from "./progressDialog.js";

export const createGlobalUIClient = ({ globalUI }) => {
  let activeUI;
  const progressOperations = new Set();

  const show = (method, options) => {
    const result = globalUI[method](options);
    activeUI = result;
    const clear = () => {
      if (activeUI === result) activeUI = undefined;
    };
    void result.then(clear, clear);
    return result;
  };

  return {
    ...globalUI,
    showAlert: (options) => show("showAlert", options),
    showConfirm: (options) => show("showConfirm", options),
    showFormDialog: (options) => show("showFormDialog", options),
    showComponentDialog: (options) => show("showComponentDialog", options),
    showDropdownMenu: (options) => show("showDropdownMenu", options),
    showProgressDialog(options) {
      const dialog = createProgressDialog(options);
      let finish;
      const operation = new Promise((resolve) => {
        finish = resolve;
      });
      progressOperations.add(operation);
      return {
        ...dialog,
        close() {
          dialog.close();
          progressOperations.delete(operation);
          finish();
        },
      };
    },
    async runWhenIdle(showUI) {
      while (activeUI || progressOperations.size > 0) {
        const pending = [...progressOperations];
        if (activeUI) pending.push(activeUI);
        // A rejected dialog still frees the surface; its caller handles the error.
        await Promise.allSettled(pending);
        // Let result handlers open any follow-up dialog before background UI.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      return showUI();
    },
  };
};
