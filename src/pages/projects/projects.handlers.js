export const handleAfterMount = async (deps) => {
  const { projectsService, store, render } = deps;

  const projects = await projectsService.loadAllProjects();
  store.setProjects(projects);
  render();
};

export const handleCreateButtonClick = async (payload, deps) => {
  const { render, store } = deps;
  store.toggleDialog();
  render();
};

export const handleOpenButtonClick = async (payload, deps) => {
  const { projectsService, store, render, tauriDialog } = deps;

  try {
    // Open folder selection dialog
    const selectedPath = await tauriDialog.openFolderDialog({
      title: "Select Existing Project Folder",
    });

    if (!selectedPath) {
      return; // User cancelled
    }

    // Open the project using service
    const importedProject =
      await projectsService.openExistingProject(selectedPath);

    // Update store with new project
    const currentProjects = store.selectProjects() || [];
    store.setProjects([...currentProjects, importedProject]);

    render();

    alert(`Project "${importedProject.name}" has been successfully imported.`);
  } catch (error) {
    console.error("Error importing project:", error);
    alert(`Failed to import project: ${error.message || error}`);
  }
};

export const handleCloseDialogue = (payload, deps) => {
  const { render, store } = deps;
  store.toggleDialog();
  render();
};

export const handleProjectsClick = async (e, deps) => {
  const { subject } = deps;
  const id = e.currentTarget.id.replace("project-", "");
  subject.dispatch("redirect", {
    path: `/project`,
    payload: {
      p: id,
    },
  });
};

export const handleBrowseFolder = async (e, deps) => {
  const { store, render, tauriDialog } = deps;

  try {
    // Open folder selection dialog using tauriDialog from deps
    const selected = await tauriDialog.openFolderDialog({
      title: "Select Project Location",
    });

    if (selected) {
      // Update the form's default value for projectPath
      store.setProjectPath(selected);
      render();
    }
  } catch (error) {
    console.error("Error selecting folder:", error);
    alert(`Error selecting folder: ${error.message || error}`);
  }
};

export const handleFormSubmit = async (e, deps) => {
  const { projectsService, initializeProject, store, render } = deps;

  try {
    // Check if it's the submit button
    if (e.detail.actionId !== "submit") {
      return;
    }

    const { name, description, template } = e.detail.formValues;
    const projectPath = store.selectProjectPath();

    // Validate input
    if (!name || !description || !projectPath) {
      return;
    }

    // Create new project using service
    const newProject = await projectsService.createNewProject({
      name,
      description,
      projectPath,
      template,
      initializeProject,
    });

    // Update store with new project
    const currentProjects = store.selectProjects() || [];
    store.setProjects([...currentProjects, newProject]);
    store.toggleDialog();

    render();

    console.log(`Project created at: ${projectPath}`);
  } catch (error) {
    console.error("Error creating project:", error);
    alert(`Failed to create project: ${error.message}`);
  }
};

export const handleProjectContextMenu = (e, deps) => {
  const { store, render } = deps;
  e.preventDefault();

  const projectId = e.currentTarget.id.replace("project-", "");
  const projects = store.selectProjects();
  const project = projects.find((p) => p.id === projectId);

  if (!project) {
    return;
  }

  store.openDropdownMenu({
    x: e.clientX,
    y: e.clientY,
    projectId: projectId,
  });
  render();
};

export const handleDropdownMenuClose = (e, deps) => {
  const { store, render } = deps;
  store.closeDropdownMenu();
  render();
};

export const handleDropdownMenuClickItem = async (e, deps) => {
  const { store, render, projectsService } = deps;
  const detail = e.detail;

  // Extract the actual item (rtgl-dropdown-menu wraps it)
  const item = detail.item || detail;

  if (item.value !== "delete") {
    // Hide dropdown for non-delete actions
    store.closeDropdownMenu();
    render();
    return;
  }

  // Get projectId BEFORE closing dropdown (important!)
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

  // Close dropdown before showing confirm dialog
  store.closeDropdownMenu();
  render();

  // Check if the result is a Promise (tauri override) or boolean (native)
  // Handle both sync and async confirm dialogs
  let confirmed;
  const confirmResult = window.confirm(
    `Are you sure you want to delete "${project.name}"? This action cannot be undone.`,
  );
  if (confirmResult instanceof Promise) {
    confirmed = await confirmResult;
  } else {
    confirmed = confirmResult;
  }

  if (!confirmed) {
    return;
  }

  // Delete the project entry using service
  await projectsService.removeProjectEntry(projectId);

  // Update store by removing from current projects
  const currentProjects = store.selectProjects();
  const updatedProjects = currentProjects.filter((p) => p.id !== projectId);
  store.setProjects(updatedProjects);
  render();
};
