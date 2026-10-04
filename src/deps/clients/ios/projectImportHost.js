import { createMobileProjectImportHost } from "../mobileProjectImportHost.js";
import { callIOSBridge } from "./bridge.js";
import { iosTransferProgress } from "./transferProgress.js";

export const iosProjectImportHost = createMobileProjectImportHost({
  callBridge: (method, payload) => callIOSBridge(method, payload),
  progressClient: iosTransferProgress,
});
