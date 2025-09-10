import { nanoid } from "nanoid";

export const handleAfterMount = async (deps) => {
  const { keyValueStore, store, render } = deps;

  // Load projects from key-value store
  const projects = await keyValueStore.get("projects");
  store.setProjects(projects || []);
  render();
};

export const handleCreateButtonClick = async (payload, deps) => {
  const { render, store } = deps;
  store.toggleDialog();
  render();
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
  const { keyValueStore, store, render } = deps;

  try {
    // Check if it's the submit button
    if (e.detail.actionId !== "submit") {
      return;
    }

    const { name, description, template } = e.detail.formValues;
    // Slot fields need to be retrieved from store using select function
    const projectPath = store.selectProjectPath();

    // Validate input
    if (!name || !description || !projectPath) {
      return;
    }

    // Generate a unique device-local project ID
    // This is only for local app storage, not for backend
    const deviceProjectId = nanoid();

    // Create new project
    const newProject = {
      id: deviceProjectId,
      name,
      description,
      projectPath,
      template,
      createdAt: Date.now(),
      lastOpenedAt: null,
    };

    // Initialize project using the service from deps
    try {
      const { initializeProject } = deps;

      await initializeProject({
        name,
        description,
        projectPath,
        template,
      });

      console.log(`Project created at: ${projectPath}`);
    } catch (error) {
      console.error("Failed to create project:", error);
      alert(`Failed to create project: ${error.message}`);
      return;
    }

    // Get existing projects
    const projects = (await keyValueStore.get("projects")) || [];

    // Add new project
    projects.push(newProject);

    // Save to key-value store
    await keyValueStore.set("projects", projects);

    // Update store and close dialog
    store.setProjects(projects);
    store.toggleDialog();

    render();
  } catch (error) {
    console.error("Error in handleFormSubmit:", error);
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
  const { store, render, keyValueStore } = deps;
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

  // Delete the project only after confirmation
  const allProjects = (await keyValueStore.get("projects")) || [];
  const updatedProjects = allProjects.filter((p) => p.id !== projectId);
  await keyValueStore.set("projects", updatedProjects);
  store.setProjects(updatedProjects);
  render();
};
