import { callAndroidBridge } from "./bridge.js";

export const createAndroidBackupClient = ({ isActive, subscribeActive }) => ({
  status: () => callAndroidBridge("getBackupStatus"),
  configure: (payload) => callAndroidBridge("configureBackup", payload),
  skip: () => callAndroidBridge("skipBackupSetup"),
  pendingProjects: () => callAndroidBridge("getPendingBackupProjects"),
  beginPass: (manual) => callAndroidBridge("beginBackupPass", { manual }),
  isActive,
  subscribeActive,
});
