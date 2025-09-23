import { nanoid } from "nanoid";

export const handleAfterMount = async (deps) => {
  const { store, render, router, projectsService } = deps;
  const { p } = router.getPayload();

  // Load projects and get versions for current project
  const projects = await projectsService.loadAllProjects();
  const currentProject = projects.find((proj) => proj.id === p);

  if (currentProject && currentProject.versions) {
    store.setVersions(currentProject.versions);
  } else {
    store.setVersions([]);
  }

  render();
};

export const handleDataChanged = () => {};

export const handleSaveVersionClick = (_, deps) => {
  const { store, render } = deps;
  store.setShowVersionForm(true);
  render();
};

export const handleVersionFormClose = (_, deps) => {
  const { store, render } = deps;
  store.resetVersionForm();
  render();
};

export const handleVersionFormAction = async (e, deps) => {
  const { store, render, repositoryFactory, router, projectsService } = deps;
  const { p } = router.getPayload();
  const actionId = e.detail.actionId;

  if (actionId === "cancel") {
    store.resetVersionForm();
    render();
  } else if (actionId === "submit") {
    const formData = e.detail.formValues;
    const repository = await repositoryFactory.getByProject(p);

    // Get current action count from repository
    const allEvents = repository.getAllEvents();
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

export const handleVersionContextMenu = (e, deps) => {
  const { store, render } = deps;
  e.preventDefault();

  const versionId = e.currentTarget.id.replace("version-", "");
  const versions = store.selectVersions();
  const version = versions.find((v) => v.id === versionId);

  if (!version) {
    return;
  }

  store.openDropdownMenu({
    x: e.clientX,
    y: e.clientY,
    versionId: versionId,
  });
  render();
};

export const handleDropdownMenuClose = (_, deps) => {
  const { store, render } = deps;
  store.closeDropdownMenu();
  render();
};

export const handleDropdownMenuClickItem = async (e, deps) => {
  const {
    store,
    render,
    projectsService,
    router,
    bundleService,
    repositoryFactory,
    fileManagerFactory,
  } = deps;
  const detail = e.detail;

  // Extract the actual item (rtgl-dropdown-menu wraps it)
  const item = detail.item || detail;

  if (item.value === "bundle") {
    // Handle Create Bundle action
    const versionId = store.selectDropdownMenuTargetVersionId();
    const versions = store.selectVersions();
    const version = versions.find((v) => v.id === versionId);

    if (!version) {
      console.warn("Version not found for bundle creation:", versionId);
      store.closeDropdownMenu();
      render();
      return;
    }

    // Close dropdown
    store.closeDropdownMenu();
    render();

    // Get project id from router
    const { p } = router.getPayload();
    const repository = await repositoryFactory.getByProject(p);
    const fileManager = await fileManagerFactory.getByProject(p);

    // Get state at specific action
    const projectData = repository.getState(version.actionIndex);

    // Collect all fileIds from project data
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

    // Create bundle with files
    const bundle = await bundleService.exportProject(projectData, files);
    const fileName = `${projectData.project.name}_${version.name}.vnbundle`;

    console.log(
      `✓ Bundle created: ${fileName} (${(bundle.length / 1024).toFixed(1)} KB)`,
    );

    alert(
      `Bundle "${fileName}" created. You can find it in system download folder.`,
    );

    bundleService.downloadBundle(bundle, fileName);
    return;
  }

  if (item.value !== "delete") {
    // Hide dropdown for other non-delete actions
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

  const versions = store.selectVersions();
  const version = versions.find((v) => v.id === versionId);

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
