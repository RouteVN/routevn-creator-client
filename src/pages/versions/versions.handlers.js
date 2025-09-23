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

export const handleDeleteVersion = async (e, deps) => {
  const { store, render, router, projectsService } = deps;
  const { p } = router.getPayload();
  const versionId = e.target.dataset.versionId;

  if (!versionId) return;

  if (confirm("Are you sure you want to delete this version?")) {
    // Delete version from project
    await projectsService.deleteVersionFromProject(p, versionId);

    store.deleteVersion(versionId);
    render();
  }
};
