import { chooseProjectFolder } from "../../../internal/ui/projectFolderSetupFlow.js";
import { selectProjectsPageCopy } from "./projectsPageCopy.js";

// Creating or importing a project on iOS needs the projects folder. Without
// one, ask for it first. Resolves to true once a folder is saved; other
// platforms, and iOS with a saved folder, resolve to true straight away.
export const ensureProjectFolder = async (deps) => {
  const { appService, store, render, i18n } = deps;
  if (appService.getPlatform() !== "ios") return true;
  if (appService.getProjectFolderSetup().configured) return true;
  if (!(await chooseProjectFolder(deps))) return false;

  // An existing projects folder can already hold projects.
  try {
    store.setProjects({ projects: await appService.loadAllProjects() });
    render();
  } catch {
    appService.showToast({
      message: selectProjectsPageCopy(i18n).failedLoadProjects,
    });
  }
  return true;
};

// A saved folder that can no longer be opened leaves the list empty, so ask
// for it again as soon as Projects opens instead of waiting for Create.
export const reconnectProjectFolder = async (deps) => {
  const { appService } = deps;
  if (appService.getPlatform() !== "ios") return;
  if (appService.getProjectFolderSetup().reason !== "reconnect") return;
  await ensureProjectFolder(deps);
};
