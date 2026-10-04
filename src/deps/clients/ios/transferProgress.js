import { createTransferProgressClient } from "../transferProgress.js";

export const iosTransferProgress = createTransferProgressClient({
  callbackName: "__routeVNIOSTransferProgress",
});
