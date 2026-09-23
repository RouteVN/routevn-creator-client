import { callAndroidBridge } from "./bridge.js";
import { createNativeProjectAcceptanceLease } from "../projectAcceptanceLease.js";

export const getAndroidProjectAcceptancePath = (projectId) =>
  callAndroidBridge("projectAcceptancePath", { projectId });
export const createAndroidProjectAcceptanceLease = ({ projectId }) =>
  createNativeProjectAcceptanceLease({
    projectPath: projectId,
    acquire: ({ projectPath, ownerId }) =>
      callAndroidBridge("acquireProjectAcceptanceLock", {
        projectId: projectPath,
        ownerId,
      }),
    release: ({ projectPath, ownerId }) =>
      callAndroidBridge("releaseProjectAcceptanceLock", {
        projectId: projectPath,
        ownerId,
      }),
  });
