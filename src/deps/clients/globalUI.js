export const createGlobalUIClient = ({ globalUI }) => {
  let activeUI;

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
    async runWhenIdle(showUI) {
      while (activeUI) {
        // A rejected dialog still frees the surface; its caller handles the error.
        await activeUI.catch(() => {});
        // Let result handlers open any follow-up dialog before background UI.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      return showUI();
    },
  };
};
