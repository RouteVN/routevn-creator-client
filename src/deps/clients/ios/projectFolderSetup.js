import { callIOSBridge } from "./bridge.js";

export const createIOSProjectFolderSetup = ({ filePicker }) => {
  let status = { configured: false };

  return {
    getStatus: () => status,

    async load() {
      try {
        status = await callIOSBridge("getProjectFolderSetup");
      } catch {
        status = { configured: false, reason: "unavailable" };
      }
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
