import { createProjectImportProgressClient } from "../projectImportProgress.js";

export const androidProjectImportProgress = createProjectImportProgressClient({
  callbackName: "__routeVNAndroidProjectImportProgress",
});
