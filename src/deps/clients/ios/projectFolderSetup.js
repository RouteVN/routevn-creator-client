import { callIOSBridge } from "./bridge.js";

export const createIOSProjectFolderSetup = ({ filePicker }) => {
  let status = { configured: false };
  let loaded = false;

  return {
    getStatus: () => status,

    // True once native reports that there is no projects folder to read: none
    // was ever chosen, or the saved one cannot be opened.
    hasNoFolder: () => loaded && !status.configured,

    async load() {
      try {
        status = await callIOSBridge("getProjectFolderSetup");
      } catch {
        status = { configured: false, reason: "unavailable" };
      }
      loaded = true;
      return status;
    },

    async pick({ title }) {
      if (status.reason === "unavailable") {
        const error = new Error(
          "Project folder setup requires an updated iOS shell.",
        );
        error.code = "unavailable";
        throw error;
      }
      // Selecting a directory never exports an empty folder over user data.
      // Native confirmation creates the default child only when it is absent.
      const folder = await filePicker.openFolderPicker({
        title,
        writable: true,
      });
      if (!folder) return undefined;
      return callIOSBridge("previewProjectFolderSetup", { uri: folder.uri });
    },

    async confirm({ uri }) {
      status = await callIOSBridge("confirmProjectFolderSetup", { uri });
      return status;
    },
  };
};
