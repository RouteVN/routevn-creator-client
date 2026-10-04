import { createMobileProjectImportHost } from "../mobileProjectImportHost.js";
import { NO_BRIDGE_TIMEOUT, callAndroidBridge } from "./bridge.js";
import { androidTransferProgress } from "./transferProgress.js";

export const androidProjectImportHost = createMobileProjectImportHost({
  callBridge: (method, payload, { noTimeout } = {}) => {
    return callAndroidBridge(method, payload, {
      timeoutMs: noTimeout ? NO_BRIDGE_TIMEOUT : undefined,
    });
  },
  progressClient: androidTransferProgress,
});
