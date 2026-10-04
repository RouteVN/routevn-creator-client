import { createTransferProgressClient } from "../transferProgress.js";

export const androidTransferProgress = createTransferProgressClient({
  callbackName: "__routeVNAndroidTransferProgress",
});
