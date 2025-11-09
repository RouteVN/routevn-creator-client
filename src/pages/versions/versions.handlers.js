import { nanoid } from "nanoid";
import { constructProjectData } from "../../utils/projectDataConstructor.js";

export const handleAfterMount = async (deps) => {
  const { store, render, router, repositoryFactory } = deps;
  const { p } = router.getPayload();

  // TODO: get project key value store
  // Load projects and get versions for current project
  // const repository = await repositoryFactory.getByProject(p);
  // const versions = (await repository.app.get("versions")) || [];
  // store.setVersions(versions);

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
  const { store, render, repositoryFactory, router, projectsService } = deps;
  const { p } = router.getPayload();
  const actionId = payload._event.detail.actionId;

  if (actionId === "cancel") {
    store.resetVersionForm();
    render();
  } else if (actionId === "submit") {
    const formData = payload._event.detail.formValues;
    const repository = await repositoryFactory.getByProject(p);

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
    await projectsService.addVersionToProject(p, newVersion);

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
  const {
    store,
    render,
    router,
    bundleService,
    repositoryFactory,
    fileManagerFactory,
    globalUI,
  } = deps;

  // Create bundle with transformed data
  globalUI.showAlert({
    message: `Please wait while the bundle is being created...`,
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

  // Get project id from router
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const fileManager = await fileManagerFactory.getByProject(p);

  // Get state at specific action
  const projectData = repository.getState(version.actionIndex);

  // Transform projectData to the required format
  const constructedProjectData = constructProjectData(projectData);
  const transformedData = {
    projectData: constructedProjectData,
  };

  // Collect all fileIds from original project data
  const fileIds = [];
  const extractFileIds = (obj) => {
    if (obj.fileId) fileIds.push(obj.fileId);
    if (obj.iconFileId) fileIds.push(obj.iconFileId);
    Object.values(obj).forEach((value) => {
      if (typeof value === "object" && value !== null) extractFileIds(value);
    });
  };
  extractFileIds(projectData);

  // Fetch files as buffers
  const files = {};
  for (const fileId of fileIds) {
    try {
      const content = await fileManager.getFileContent({ fileId });
      const response = await fetch(content.url);
      const buffer = await response.arrayBuffer();
      files[fileId] = {
        buffer: new Uint8Array(buffer),
        mime: content.type,
      };
    } catch (error) {
      console.warn(`Failed to fetch file ${fileId}:`, error);
    }
  }

  // Create bundle with transformed data
  const bundle = await bundleService.exportProject(transformedData, files);
  const zipName = `${projectData.project.name}_${version.name}`;

  console.log(
    `✓ Bundle created: package.bin (${(bundle.length / 1024).toFixed(1)} KB)`,
  );

  // Create and download ZIP with bundle and static files using save dialog
  try {
    const savedPath = await bundleService.createDistributionZip(
      bundle,
      zipName,
    );
    if (savedPath) {
      console.log(`✓ Distribution ZIP created and saved to: ${savedPath}`);
      globalUI.closeAll();
    } else {
      // User cancelled the dialog
      console.log("Save dialog cancelled by user");
    }
  } catch (error) {
    console.error("Error saving ZIP with dialog:", error);
    globalUI.showAlert({
      message: `Failed to save ZIP file: ${error.message}`,
      title: "Error",
    });
  }
};

export const handleDropdownMenuClickItem = async (deps, payload) => {
  const { store, render, projectsService, router } = deps;
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

  // Get project id from router
  const { p } = router.getPayload();

  // Delete the version entry using service
  await projectsService.deleteVersionFromProject(p, versionId);

  // Update store by removing from current versions
  store.deleteVersion(versionId);
  render();
};
