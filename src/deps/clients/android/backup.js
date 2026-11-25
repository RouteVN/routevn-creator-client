import { callAndroidBridge } from "./bridge.js";

// Native code schedules and runs every backup. The page reads the status it
// keeps in memory, receives updates as they happen, and asks for changes.
export const createAndroidBackupClient = ({
  windowTarget = globalThis.window,
} = {}) => ({
  status: () => callAndroidBridge("getBackupStatus"),
  configure: (payload) => callAndroidBridge("configureBackup", payload),
  disable: () => callAndroidBridge("disableBackup"),
  request: (payload) => callAndroidBridge("requestBackup", payload),
  setNotificationCopy: (payload) =>
    callAndroidBridge("setBackupNotificationCopy", payload),
  subscribeStatus(listener) {
    const handleStatus = (status) => listener(status);
    windowTarget.routeVNBackupStatusChanged = handleStatus;
    return () => {
      if (windowTarget.routeVNBackupStatusChanged === handleStatus) {
        delete windowTarget.routeVNBackupStatusChanged;
      }
    };
  },
});
