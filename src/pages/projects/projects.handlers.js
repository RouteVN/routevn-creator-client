export const handleAfterMount = async (deps) => {
  const { appService, store, render } = deps;
  const platform = appService.getPlatform();
  store.setPlatform({ platform: platform });
  const projects = await appService.loadAllProjects();
  store.setProjects({ projects: projects });
  render();
};

export const handleCreateButtonClick = async (deps) => {
  const { render, store } = deps;
  store.toggleDialog();
  render();
};

export const handleOpenButtonClick = async (deps) => {
  const { appService, store, render } = deps;

  try {
    const selectedPath = await appService.openFolderPicker({
      title: "Select Existing Project Folder",
    });

    if (!selectedPath) {
      return;
    }

    const importedProject = await appService.openExistingProject(selectedPath);

    store.addProject({ project: importedProject });
    render();

    appService.showToast(
      `Project "${importedProject.name}" has been successfully imported.`,
    );
  } catch (error) {
    console.error("Error importing project:", error);
    appService.showToast(`Failed to import project: ${error.message || error}`);
  }
};

export const handleCloseDialogue = (deps) => {
  const { render, store } = deps;
  store.toggleDialog();
  render();
};

export const handleProjectsClick = async (deps, payload) => {
  const { appService } = deps;
  const id = payload._event.currentTarget.id.replace("project", "");
  appService.navigate("/project", { p: id });
};

export const handleBrowseFolder = async (deps) => {
  const { appService, store, render } = deps;

  try {
    const selected = await appService.openFolderPicker({
      title: "Select Project Location",
    });

    if (selected) {
      store.setProjectPath({ path: selected });
      render();
    }
  } catch (error) {
    console.error("Error selecting folder:", error);
    appService.showToast(`Error selecting folder: ${error.message || error}`);
  }
};

export const handleFormSubmit = async (deps, payload) => {
  const { appService, store, render } = deps;
  const platform = appService.getPlatform();

  try {
    if (payload._event.detail.actionId !== "submit") {
      return;
    }

    const {
      name,
      description,
      template = "default",
    } = payload._event.detail.values;

    if (name === "_TEST_FILE_PERMISSIONS_") {
      window.location.href = "/test-permissions.html";
      return;
    }

    const projectPath = store.selectProjectPath();

    if (!name || !description || (platform !== "web" && !projectPath)) {
      let message = "Please fill in all required fields.";
      if (!name) {
        message = "Project Name is required.";
      } else if (!description) {
        message = "Project Description is required.";
      } else if (platform !== "web" && !projectPath) {
        message = "Project Location is required.";
      }

      appService.showToast(message);
      return;
    }

    const newProject = await appService.createNewProject({
      name,
      description,
      projectPath,
      template,
    });

    store.addProject({ project: newProject });
    store.toggleDialog();
    render();
  } catch (error) {
    console.error("Error creating project:", error);
    appService.showToast(`Failed to create project: ${error.message}`);
  }
};

export const handleProjectContextMenu = (deps, payload) => {
  const { store, render } = deps;
  payload._event.preventDefault();

  const projectId = payload._event.currentTarget.id.replace("project", "");
  const projects = store.selectProjects();
  const project = projects.find((p) => p.id === projectId);

  if (!project) {
    return;
  }

  store.openDropdownMenu({
    x: payload._event.clientX,
    y: payload._event.clientY,
    projectId: projectId,
  });
  render();
};

export const handleDropdownMenuClose = (deps) => {
  const { store, render } = deps;
  store.closeDropdownMenu();
  render();
};

export const handleDropdownMenuClickItem = async (deps, payload) => {
  const { appService, store, render } = deps;
  const detail = payload._event.detail;

  const item = detail.item || detail;

  if (item.value !== "delete") {
    store.closeDropdownMenu();
    render();
    return;
  }

  const projectId = store.selectDropdownMenuTargetProjectId();

  if (!projectId) {
    console.warn("No projectId found for deletion");
    store.closeDropdownMenu();
    render();
    return;
  }

  const projects = store.selectProjects();
  const project = projects.find((p) => p.id === projectId);

  if (!project) {
    console.warn("Project not found for deletion:", projectId);
    store.closeDropdownMenu();
    render();
    return;
  }

  store.closeDropdownMenu();
  render();

  const confirmed = await appService.showDialog({
    message: `Are you sure you want to delete "${project.name}"? This action cannot be undone.`,
    title: "Delete Project",
    confirmText: "Delete",
    cancelText: "Cancel",
  });

  if (!confirmed) {
    return;
  }

  await appService.removeProjectEntry(projectId);

  store.removeProject({ projectId: projectId });
  render();
};
