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
    const currentActionId = allEvents.length;

    // Create simple version object
    const newVersion = {
      id: nanoid(),
      name: formData.name,
      actionId: currentActionId,
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
  const { store, render, projectsService, router } = deps;
  const detail = e.detail;

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
