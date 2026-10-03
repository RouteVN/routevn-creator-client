import { createProjectImportProgressClient } from "../projectImportProgress.js";

export const iosProjectImportProgress = createProjectImportProgressClient({
  callbackName: "__routeVNIOSProjectImportProgress",
});
