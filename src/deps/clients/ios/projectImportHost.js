import { createMobileProjectImportHost } from "../mobileProjectImportHost.js";
import { callIOSBridge } from "./bridge.js";
import { iosProjectImportProgress } from "./projectImportProgress.js";

export const iosProjectImportHost = createMobileProjectImportHost({
  callBridge: (method, payload) => callIOSBridge(method, payload),
  progressClient: iosProjectImportProgress,
});
