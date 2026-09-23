import { invoke } from "@tauri-apps/api/core";
import { createNativeProjectAcceptanceLease } from "../projectAcceptanceLease.js";

export const canonicalProjectPath = (projectPath) =>
  invoke("canonical_project_path", { projectPath });
export const createTauriProjectAcceptanceLease = ({ projectPath }) =>
  createNativeProjectAcceptanceLease({
    projectPath,
    acquire: (input) => invoke("acquire_project_acceptance_lock", input),
    release: (input) => invoke("release_project_acceptance_lock", input),
  });
