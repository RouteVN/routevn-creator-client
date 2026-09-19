import { callIOSBridge } from "./bridge.js";
import { createNativeProjectAcceptanceLease } from "../projectAcceptanceLease.js";

export const getIOSProjectAcceptancePath = (projectId) =>
  callIOSBridge("projectAcceptancePath", { projectId });
export const createIOSProjectAcceptanceLease = ({ projectId }) =>
  createNativeProjectAcceptanceLease({
    projectPath: projectId,
    acquire: ({ projectPath, ownerId }) =>
      callIOSBridge("acquireProjectAcceptanceLock", {
        projectId: projectPath,
        ownerId,
      }),
    release: ({ projectPath, ownerId }) =>
      callIOSBridge("releaseProjectAcceptanceLock", {
        projectId: projectPath,
        ownerId,
      }),
  });
