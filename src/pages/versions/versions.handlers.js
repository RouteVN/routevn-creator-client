import { nanoid } from "nanoid";
import { constructProjectData } from "../../utils/projectDataConstructor.js";
import {
  buildFilteredStateForExport,
  collectUsedResourcesForExport,
} from "../../utils/resourceUsageChecker.js";

export const handleAfterMount = async (deps) => {
  const { store, render, projectService, appService } = deps;
  const { p: projectId } = appService.getPayload();
  await projectService.ensureRepository();
  const adapter = projectService.getAdapterById(projectId);
  const versions = (await adapter.app.get("versions")) || [];
  store.setVersions(versions);

  render();
};

export const handleDataChanged = () => {};

export const handleSaveVersionClick = (deps) => {
  const { store, render } = deps;
  store.setShowVersionForm(true);
  render();
};

export const handleVersionFormClose = (deps) => {
  const { store, render } = deps;
  store.resetVersionForm();
  render();
};

export const handleVersionFormAction = async (deps, payload) => {
  const { store, render, projectService, appService } = deps;
  const { p } = appService.getPayload();
  const actionId = payload._event.detail.actionId;

  if (actionId === "cancel") {
    store.resetVersionForm();
    render();
  } else if (actionId === "submit") {
    const formData = payload._event.detail.formValues;
    const repository = await projectService.getRepository();

    // Get current action count from repository
    const allEvents = repository.getEvents();
    const currentActionIndex = allEvents.length;

    // Create simple version object
    const newVersion = {
      id: nanoid(),
      name: formData.name,
      actionIndex: currentActionIndex,
      createdAt: new Date().toISOString(),
    };

    // Save version to project
    await projectService.addVersionToProject(p, newVersion);

    // Update UI
    store.addVersion(newVersion);
    store.resetVersionForm();
    render();
  }
};

export const handleVersionContextMenu = (deps, payload) => {
  const { store, render } = deps;
  payload._event.preventDefault();

  const versionId = payload._event.currentTarget.id.replace(
    "version-more-btn-",
    "",
  );
  const versions = store.selectVersions();
  const version = versions.find((v) => v.id === versionId);

  if (!version) {
    return;
  }

  store.openDropdownMenu({
    x: payload._event.clientX,
    y: payload._event.clientY,
    versionId: versionId,
  });
  render();
};

export const handleDropdownMenuClose = (deps) => {
  const { store, render } = deps;
  store.closeDropdownMenu();
  render();
};

export const handleDownloadZipClick = async (deps, payload) => {
  const { store, render, projectService, appService } = deps;

  // Create bundle with transformed data
  appService.showToast("Please wait while the bundle is being created...", {
    title: "Bundle in progress",
  });

  // Get versionId from the button or data attributes
  const versionId = payload._event.currentTarget.id.replace(
    "version-download-",
    "",
  );

  const version = store.selectVersion(versionId);

  if (!version) {
    console.warn("Version not found for bundle creation:", versionId);
    return;
  }

  // Close dropdown if open
  store.closeDropdownMenu();
  render();

  const repository = await projectService.getRepository();

  // Get state at specific action
  const projectData = repository.getState(version.actionIndex);

  const usage = collectUsedResourcesForExport(projectData);
  const filteredState = buildFilteredStateForExport(projectData, usage);

  // Transform filtered project data to the required format
  const constructedProjectData = constructProjectData(filteredState);
  const transformedData = {
    projectData: constructedProjectData,
  };
  const fileIds = usage.fileIds;
  const zipName = `${projectData.project.name}_${version.name}`;

  // Create and download ZIP with streamed bundle creation
  try {
    await projectService.createDistributionZipStreamed(
      transformedData,
      fileIds,
      zipName,
    );
    appService.closeAll();
  } catch (error) {
    console.error("Error saving ZIP with dialog:", error);
    appService.showToast(`Failed to save ZIP file: ${error.message}`, {
      title: "Error",
    });
  }
};

export const handleDropdownMenuClickItem = async (deps, payload) => {
  const { store, render, projectService, appService } = deps;
  const detail = payload._event.detail;

  // Extract the actual item (rtgl-dropdown-menu wraps it)
  const item = detail.item || detail;

  if (item.value !== "delete") {
    // Hide dropdown for non-delete actions
    store.closeDropdownMenu();
    render();
    return;
  }

  // Get versionId BEFORE closing dropdown (important!)
  const versionId = store.selectDropdownMenuTargetVersionId();

  if (!versionId) {
    console.warn("No versionId found for deletion");
    store.closeDropdownMenu();
    render();
    return;
  }

  const version = store.selectVersion(versionId);

  if (!version) {
    console.warn("Version not found for deletion:", versionId);
    store.closeDropdownMenu();
    render();
    return;
  }

  // Close dropdown
  store.closeDropdownMenu();
  render();

  // Get project id from appService
  const { p } = appService.getPayload();

  // Delete the version entry using service
  await projectService.deleteVersionFromProject(p, versionId);

  // Update store by removing from current versions
  store.deleteVersion(versionId);
  render();
};
